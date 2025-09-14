from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import os
from dotenv import load_dotenv
import logging
from datetime import datetime

from pr_agent import PRAgent
from doc_generator import DocumentationGenerator
from readme_updater import ReadmeUpdater
from llm import llm_client, GenerationRequest

# Import new MCP tools
try:
    from neo4j_tools import Neo4jTools
    neo4j_tools = Neo4jTools()
    neo4j_available = True
except ImportError:
    neo4j_available = False
    neo4j_tools = None

try:
    from code_analysis_tools import CodeAnalysisTools
    code_analysis_tools = CodeAnalysisTools()
    code_analysis_available = True
except ImportError:
    code_analysis_available = False
    code_analysis_tools = None

try:
    from project_management_tools import ProjectManagementTools
    project_management_tools = ProjectManagementTools()
    project_management_available = True
except ImportError:
    project_management_available = False
    project_management_tools = None

load_dotenv()

app = FastAPI(title="MCP Server for Kanban PR Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

pr_agent = PRAgent()
doc_generator = DocumentationGenerator()
readme_updater = ReadmeUpdater()

class RPCRequest(BaseModel):
    method: str
    params: Dict[str, Any]
    id: Optional[int] = None

class RPCResponse(BaseModel):
    result: Optional[Any] = None
    error: Optional[Dict[str, Any]] = None
    id: Optional[int] = None

def verify_api_key(x_api_key: str = Header(None)):
    expected_key = os.getenv("MCP_API_KEY")
    if expected_key and x_api_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key

@app.post("/api/generate")
async def generate(request: GenerationRequest, api_key: str = Depends(verify_api_key)):
    try:
        result = llm_client.generate(
            prompt=request.prompt,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens
        )
        return {"result": result}
    except Exception as e:
        logger.error(f"Generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/rpc", response_model=RPCResponse)
async def handle_rpc(request: RPCRequest, api_key: str = Depends(verify_api_key)):
    try:
        method_handlers = {
            # Original PR and documentation tools
            "analyze_code_changes": pr_agent.analyze_changes,
            "generate_pr_description": pr_agent.generate_description,
            "select_reviewers": pr_agent.select_reviewers,
            "analyze_pr_changes": pr_agent.analyze_pr_changes,
            "generate_documentation": doc_generator.generate,
            "get_readme": readme_updater.get_readme,
            "update_readme": readme_updater.update,
            "update_project_docs": doc_generator.update_project_docs,
        }

        # Add Neo4j/Graph Database tools
        if neo4j_available and neo4j_tools:
            method_handlers.update({
                "query_graph": neo4j_tools.query_graph,
                "visualize_relationships": neo4j_tools.visualize_relationships,
                "analyze_code_dependencies": neo4j_tools.analyze_code_dependencies,
                "find_similar_patterns": neo4j_tools.find_similar_patterns,
                "extract_knowledge": neo4j_tools.extract_knowledge,
            })

        # Add Code Analysis tools
        if code_analysis_available and code_analysis_tools:
            method_handlers.update({
                "analyze_code_quality": code_analysis_tools.analyze_code_quality,
                "calculate_metrics": code_analysis_tools.calculate_metrics,
            })

        # Add Documentation & Knowledge Management tools
        method_handlers.update({
            "generate_api_docs": doc_generator.generate_api_docs,
            "update_changelog": doc_generator.update_changelog,
            "search_documentation": doc_generator.search_documentation,
        })

        # Add Project Management tools
        if project_management_available and project_management_tools:
            method_handlers.update({
                "analyze_team_velocity": project_management_tools.analyze_team_velocity,
                "generate_reports": project_management_tools.generate_reports,
            })
        
        handler = method_handlers.get(request.method)
        if not handler:
            return RPCResponse(
                error={"code": -32601, "message": "Method not found"},
                id=request.id
            )
        
        result = await handler(**request.params)
        return RPCResponse(result=result, id=request.id)
        
    except Exception as e:
        logger.error(f"RPC error: {str(e)}")
        return RPCResponse(
            error={"code": -32603, "message": str(e)},
            id=request.id
        )

@app.get("/health")
async def health_check():
    services = {
        "pr_agent": "active",
        "doc_generator": "active",
        "readme_updater": "active"
    }

    # Check Neo4j tools availability
    if neo4j_available:
        services["neo4j_tools"] = "active"
    else:
        services["neo4j_tools"] = "unavailable"

    # Check code analysis tools
    if code_analysis_available:
        services["code_analysis_tools"] = "active"
    else:
        services["code_analysis_tools"] = "unavailable"

    # Check project management tools
    if project_management_available:
        services["project_management_tools"] = "active"
    else:
        services["project_management_tools"] = "unavailable"

    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0",
        "total_tools": len([k for k in services.keys() if services[k] == "active"]) * 3,  # Approx tools per service
        "services": services
    }

@app.post("/webhook/github")
async def github_webhook(payload: Dict[str, Any]):
    event_type = payload.get("action")
    
    if event_type == "opened" and "pull_request" in payload:
        pr_data = payload["pull_request"]
        await pr_agent.process_new_pr(pr_data)
    
    return {"status": "processed"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)