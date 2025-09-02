import os
from typing import Dict, List, Any, Optional
from github import Github
from git import Repo
import openai
import logging
import json
from pathlib import Path

logger = logging.getLogger(__name__)

class PRAgent:
    def __init__(self):
        self.github_token = os.getenv("GITHUB_TOKEN")
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.github = Github(self.github_token) if self.github_token else None
        openai.api_key = self.openai_api_key
        
    async def analyze_changes(self, changes: Dict[str, Any]) -> Dict[str, Any]:
        try:
            files_changed = changes.get("files", [])
            
            analysis = {
                "summary": self._summarize_changes(files_changed),
                "impact": self._assess_impact(files_changed),
                "suggestions": self._generate_suggestions(files_changed),
                "test_requirements": self._identify_test_requirements(files_changed)
            }
            
            return analysis
        except Exception as e:
            logger.error(f"Error analyzing changes: {e}")
            raise
    
    async def generate_description(self, context: Dict[str, Any]) -> str:
        try:
            prompt = self._build_pr_description_prompt(context)
            
            response = openai.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that generates clear, comprehensive pull request descriptions."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=1000
            )
            
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Error generating PR description: {e}")
            raise
    
    async def select_reviewers(self, changes: Dict[str, Any]) -> List[str]:
        try:
            files_changed = changes.get("files", [])
            
            code_owners = self._get_code_owners(files_changed)
            
            recent_contributors = self._get_recent_contributors(files_changed)
            
            reviewers = list(set(code_owners + recent_contributors))[:3]
            
            return reviewers
        except Exception as e:
            logger.error(f"Error selecting reviewers: {e}")
            return []
    
    async def analyze_pr_changes(self, 
                                repositoryUrl: str, 
                                branch: str, 
                                baseBranch: str = "main") -> Dict[str, Any]:
        try:
            owner, repo_name = self._parse_repo_url(repositoryUrl)
            repo = self.github.get_repo(f"{owner}/{repo_name}")
            
            comparison = repo.compare(baseBranch, branch)
            
            files_data = []
            for file in comparison.files:
                files_data.append({
                    "filename": file.filename,
                    "status": file.status,
                    "additions": file.additions,
                    "deletions": file.deletions,
                    "changes": file.changes,
                    "patch": file.patch if hasattr(file, 'patch') else None
                })
            
            return {
                "filesChanged": comparison.files.totalCount if hasattr(comparison.files, 'totalCount') else len(comparison.files),
                "additions": comparison.additions,
                "deletions": comparison.deletions,
                "files": files_data,
                "commits": [
                    {
                        "sha": commit.sha,
                        "message": commit.commit.message,
                        "author": commit.commit.author.name
                    }
                    for commit in comparison.commits
                ]
            }
        except Exception as e:
            logger.error(f"Error analyzing PR changes: {e}")
            raise
    
    async def process_new_pr(self, pr_data: Dict[str, Any]) -> None:
        try:
            pr_number = pr_data["number"]
            repo_full_name = pr_data["base"]["repo"]["full_name"]
            
            repo = self.github.get_repo(repo_full_name)
            pr = repo.get_pull(pr_number)
            
            if not pr.body or len(pr.body) < 50:
                changes = await self.analyze_pr_changes(
                    pr_data["base"]["repo"]["html_url"],
                    pr_data["head"]["ref"],
                    pr_data["base"]["ref"]
                )
                
                context = {
                    "title": pr.title,
                    "branch": pr_data["head"]["ref"],
                    "changes": changes
                }
                
                description = await self.generate_description(context)
                pr.edit(body=description)
                
            labels = self._suggest_labels(pr_data)
            if labels:
                pr.add_to_labels(*labels)
                
        except Exception as e:
            logger.error(f"Error processing new PR: {e}")
    
    def _summarize_changes(self, files: List[Dict]) -> str:
        total_additions = sum(f.get("additions", 0) for f in files)
        total_deletions = sum(f.get("deletions", 0) for f in files)
        
        file_types = {}
        for file in files:
            ext = Path(file["filename"]).suffix
            file_types[ext] = file_types.get(ext, 0) + 1
        
        summary = f"Modified {len(files)} files with {total_additions} additions and {total_deletions} deletions. "
        summary += f"File types affected: {', '.join(file_types.keys())}"
        
        return summary
    
    def _assess_impact(self, files: List[Dict]) -> str:
        critical_patterns = ["database", "migration", "schema", "auth", "security"]
        high_impact_files = []
        
        for file in files:
            filename = file["filename"].lower()
            if any(pattern in filename for pattern in critical_patterns):
                high_impact_files.append(file["filename"])
        
        if high_impact_files:
            return f"HIGH - Critical files modified: {', '.join(high_impact_files[:3])}"
        elif len(files) > 10:
            return "MEDIUM - Large number of files changed"
        else:
            return "LOW - Routine changes"
    
    def _generate_suggestions(self, files: List[Dict]) -> List[str]:
        suggestions = []
        
        if any("test" in f["filename"].lower() for f in files):
            suggestions.append("Run all tests before merging")
        
        if any("config" in f["filename"].lower() for f in files):
            suggestions.append("Verify configuration changes in staging environment")
        
        if any("api" in f["filename"].lower() for f in files):
            suggestions.append("Update API documentation if endpoints changed")
        
        return suggestions
    
    def _identify_test_requirements(self, files: List[Dict]) -> List[str]:
        requirements = []
        
        for file in files:
            if "service" in file["filename"].lower():
                requirements.append(f"Unit tests for {file['filename']}")
            elif "api" in file["filename"].lower():
                requirements.append(f"Integration tests for {file['filename']}")
        
        return requirements[:5]
    
    def _get_code_owners(self, files: List[Dict]) -> List[str]:
        return []
    
    def _get_recent_contributors(self, files: List[Dict]) -> List[str]:
        return []
    
    def _parse_repo_url(self, url: str) -> tuple:
        import re
        match = re.search(r'github\.com[:/]([^/]+)/([^/.]+)', url)
        if match:
            return match.groups()
        raise ValueError(f"Invalid GitHub URL: {url}")
    
    def _build_pr_description_prompt(self, context: Dict[str, Any]) -> str:
        return f"""Generate a comprehensive pull request description for the following:

Title: {context.get('title', 'N/A')}
Branch: {context.get('branch', 'N/A')}
Task: {context.get('task', {}).get('title', 'N/A') if context.get('task') else 'N/A'}

Changes Summary:
{json.dumps(context.get('changes', {}), indent=2)}

Please include:
1. ## Summary - Brief overview of changes
2. ## Changes - Detailed list of modifications
3. ## Testing - How the changes were tested
4. ## Impact - Potential impact on existing functionality
5. ## Checklist - Standard PR checklist items

Format as proper markdown."""
    
    def _suggest_labels(self, pr_data: Dict[str, Any]) -> List[str]:
        labels = []
        title = pr_data["title"].lower()
        
        if "fix" in title or "bug" in title:
            labels.append("bug")
        if "feat" in title or "feature" in title:
            labels.append("enhancement")
        if "docs" in title:
            labels.append("documentation")
        if "test" in title:
            labels.append("testing")
        
        return labels