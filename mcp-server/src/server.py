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

@app.post("/rpc", response_model=RPCResponse)
async def handle_rpc(request: RPCRequest, api_key: str = Depends(verify_api_key)):
    try:
        method_handlers = {
            "analyze_code_changes": pr_agent.analyze_changes,
            "generate_pr_description": pr_agent.generate_description,
            "select_reviewers": pr_agent.select_reviewers,
            "analyze_pr_changes": pr_agent.analyze_pr_changes,
            "generate_documentation": doc_generator.generate,
            "get_readme": readme_updater.get_readme,
            "update_readme": readme_updater.update,
            "update_project_docs": doc_generator.update_project_docs,
        }
        
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
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "pr_agent": "active",
            "doc_generator": "active",
            "readme_updater": "active"
        }
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