import os
import re
from typing import Dict, List, Optional
from pathlib import Path
from git import Repo
import logging

logger = logging.getLogger(__name__)

class ReadmeUpdater:
    def __init__(self):
        self.repo_path = Path(os.getenv("REPO_PATH", "/app/repos"))
        self.readme_path = self.repo_path / "README.md"
    
    async def get_readme(self) -> Dict[str, str]:
        try:
            if self.readme_path.exists():
                content = self.readme_path.read_text()
                return {"content": content}
            else:
                return {"content": "# Project README\n\nNo README file found."}
        except Exception as e:
            logger.error(f"Error reading README: {e}")
            return {"content": f"Error reading README: {str(e)}"}
    
    async def update(self, content: str) -> Dict[str, str]:
        try:
            self.readme_path.write_text(content)
            
            if self._is_git_repo():
                self._commit_changes("Update README.md")
            
            return {
                "status": "success",
                "message": "README updated successfully"
            }
        except Exception as e:
            logger.error(f"Error updating README: {e}")
            raise
    
    async def update_section(self, 
                           section_name: str,
                           new_content: str) -> Dict[str, str]:
        try:
            current_content = self.readme_path.read_text() if self.readme_path.exists() else ""
            
            updated_content = self._update_section_content(
                current_content,
                section_name,
                new_content
            )
            
            self.readme_path.write_text(updated_content)
            
            if self._is_git_repo():
                self._commit_changes(f"Update README.md - {section_name} section")
            
            return {
                "status": "success",
                "message": f"Section '{section_name}' updated successfully"
            }
        except Exception as e:
            logger.error(f"Error updating README section: {e}")
            raise
    
    async def add_badge(self, badge_type: str, badge_content: str) -> Dict[str, str]:
        try:
            current_content = self.readme_path.read_text() if self.readme_path.exists() else "# Project\n\n"
            
            lines = current_content.split('\n')
            
            badge_line_index = self._find_badge_section(lines)
            
            if badge_line_index == -1:
                lines.insert(2, "")
                lines.insert(3, badge_content)
            else:
                lines.insert(badge_line_index + 1, badge_content)
            
            updated_content = '\n'.join(lines)
            self.readme_path.write_text(updated_content)
            
            return {
                "status": "success",
                "message": f"Badge '{badge_type}' added successfully"
            }
        except Exception as e:
            logger.error(f"Error adding badge: {e}")
            raise
    
    async def update_changelog(self, version: str, changes: List[str]) -> Dict[str, str]:
        try:
            changelog_path = self.repo_path / "CHANGELOG.md"
            
            if changelog_path.exists():
                current_content = changelog_path.read_text()
            else:
                current_content = "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n"
            
            from datetime import datetime
            date_str = datetime.now().strftime("%Y-%m-%d")
            
            new_entry = f"\n## [{version}] - {date_str}\n\n"
            for change in changes:
                new_entry += f"- {change}\n"
            
            lines = current_content.split('\n')
            insert_index = self._find_changelog_insert_point(lines)
            
            for i, line in enumerate(new_entry.split('\n')):
                lines.insert(insert_index + i, line)
            
            updated_content = '\n'.join(lines)
            changelog_path.write_text(updated_content)
            
            return {
                "status": "success",
                "message": f"Changelog updated with version {version}"
            }
        except Exception as e:
            logger.error(f"Error updating changelog: {e}")
            raise
    
    def _update_section_content(self, 
                               content: str,
                               section_name: str,
                               new_content: str) -> str:
        section_pattern = rf"(#+\s+{re.escape(section_name)}.*?)((?=\n#+\s+)|$)"
        
        match = re.search(section_pattern, content, re.DOTALL | re.IGNORECASE)
        
        if match:
            section_header = match.group(1).rstrip()
            updated_section = f"{section_header}\n\n{new_content}\n"
            updated_content = content[:match.start()] + updated_section + content[match.end():]
        else:
            if not content.endswith('\n'):
                content += '\n'
            updated_content = content + f"\n## {section_name}\n\n{new_content}\n"
        
        return updated_content
    
    def _find_badge_section(self, lines: List[str]) -> int:
        for i, line in enumerate(lines):
            if line.strip().startswith('![') or line.strip().startswith('[!['):
                return i
        
        for i, line in enumerate(lines):
            if line.startswith('#'):
                return i + 1
        
        return -1
    
    def _find_changelog_insert_point(self, lines: List[str]) -> int:
        for i, line in enumerate(lines):
            if line.startswith('## ['):
                return i
        
        for i, line in enumerate(lines):
            if 'changelog' in line.lower():
                return i + 2
        
        return len(lines)
    
    def _is_git_repo(self) -> bool:
        try:
            Repo(self.repo_path)
            return True
        except:
            return False
    
    def _commit_changes(self, message: str) -> None:
        try:
            repo = Repo(self.repo_path)
            repo.index.add(['README.md', 'CHANGELOG.md'])
            repo.index.commit(message)
            logger.info(f"Committed changes: {message}")
        except Exception as e:
            logger.warning(f"Could not commit changes: {e}")