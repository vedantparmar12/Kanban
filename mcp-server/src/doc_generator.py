import os
import ast
import re
from typing import Dict, List, Any, Optional
from pathlib import Path
import markdown
import openai
import logging

logger = logging.getLogger(__name__)

class DocumentationGenerator:
    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        openai.api_key = self.openai_api_key
        self.repo_path = Path(os.getenv("REPO_PATH", "/app/repos"))
    
    async def generate(self, 
                      code: Optional[str] = None,
                      type: str = "general",
                      path: Optional[str] = None,
                      includeExamples: bool = True) -> Dict[str, Any]:
        try:
            if path:
                code = self._read_file(path)
            
            if not code:
                return {"documentation": "", "metadata": {"error": "No code provided"}}
            
            if type == "api":
                docs = await self._generate_api_docs(code, includeExamples)
            elif type == "component":
                docs = await self._generate_component_docs(code, includeExamples)
            elif type == "architecture":
                docs = await self._generate_architecture_docs(code)
            else:
                docs = await self._generate_general_docs(code, includeExamples)
            
            metadata = {
                "type": type,
                "timestamp": str(Path.ctime(Path())),
                "includesExamples": includeExamples
            }
            
            return {"documentation": docs, "metadata": metadata}
        except Exception as e:
            logger.error(f"Error generating documentation: {e}")
            raise
    
    async def update_project_docs(self, 
                                 documentation: str,
                                 prId: Optional[str] = None) -> Dict[str, str]:
        try:
            docs_path = self.repo_path / "docs"
            docs_path.mkdir(exist_ok=True)
            
            if prId:
                filename = f"pr_{prId}_docs.md"
            else:
                filename = f"generated_docs_{Path.ctime(Path())}.md"
            
            file_path = docs_path / filename
            file_path.write_text(documentation)
            
            self._update_docs_index(filename)
            
            return {
                "status": "success",
                "path": str(file_path),
                "message": "Documentation updated successfully"
            }
        except Exception as e:
            logger.error(f"Error updating project docs: {e}")
            raise
    
    async def _generate_api_docs(self, code: str, includeExamples: bool) -> str:
        prompt = f"""Generate comprehensive API documentation for the following code:

{code}

Include:
1. Endpoint descriptions
2. Request/Response formats
3. Authentication requirements
4. Error codes
{"5. Usage examples" if includeExamples else ""}

Format as proper markdown with clear sections."""

        response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a technical documentation expert."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=2000
        )
        
        return response.choices[0].message.content
    
    async def _generate_component_docs(self, code: str, includeExamples: bool) -> str:
        prompt = f"""Generate component documentation for the following code:

{code}

Include:
1. Component purpose and description
2. Props/Parameters documentation
3. Methods/Functions description
4. Events/Callbacks
{"5. Usage examples with code snippets" if includeExamples else ""}

Format as proper markdown."""

        response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a frontend documentation expert."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=2000
        )
        
        return response.choices[0].message.content
    
    async def _generate_architecture_docs(self, code: str) -> str:
        prompt = f"""Generate architecture documentation based on the following code structure:

{code}

Include:
1. System overview
2. Component relationships
3. Data flow
4. Design patterns used
5. Scalability considerations

Format as proper markdown with diagrams where appropriate (use mermaid syntax)."""

        response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a software architecture expert."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=2000
        )
        
        return response.choices[0].message.content
    
    async def _generate_general_docs(self, code: str, includeExamples: bool) -> str:
        file_type = self._detect_file_type(code)
        
        prompt = f"""Generate documentation for the following {file_type} code:

{code}

Include:
1. Overview and purpose
2. Key functions/classes/methods
3. Dependencies
4. Configuration requirements
{"5. Usage examples" if includeExamples else ""}

Format as proper markdown."""

        response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a technical documentation expert."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=2000
        )
        
        return response.choices[0].message.content
    
    def _read_file(self, path: str) -> str:
        file_path = self.repo_path / path
        if file_path.exists():
            return file_path.read_text()
        return ""
    
    def _detect_file_type(self, code: str) -> str:
        if "import React" in code or "export default" in code:
            return "React/TypeScript"
        elif "from flask" in code or "from fastapi" in code:
            return "Python Web Framework"
        elif "class " in code and "def " in code:
            return "Python"
        elif "function " in code or "const " in code:
            return "JavaScript/TypeScript"
        else:
            return "general"
    
    def _update_docs_index(self, new_file: str) -> None:
        index_path = self.repo_path / "docs" / "index.md"
        
        if index_path.exists():
            content = index_path.read_text()
        else:
            content = "# Documentation Index\n\n## Generated Documentation\n\n"
        
        if new_file not in content:
            content += f"- [{new_file}](./{new_file})\n"
            index_path.write_text(content)