import os
import openai
from pydantic import BaseModel, Field
from typing import List, Dict, Any

class LLMClient:
    def __init__(self):
        self.client = openai.OpenAI(
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url=os.getenv("OPENROUTER_BASE_URL"),
        )

    def generate(self, prompt: str, model: str = None, temperature: float = 0.7, max_tokens: int = 2000) -> str:
        model = model or os.getenv("OPENAI_MODEL")
        try:
            chat_completion = self.client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful assistant.",
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                # The following are OpenRouter-specific headers
                extra_headers={
                    "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL"),
                }
            )
            return chat_completion.choices[0].message.content
        except Exception as e:
            print(f"LLM generation failed: {e}")
            raise

class GenerationRequest(BaseModel):
    prompt: str
    model: str = Field(default=None)
    temperature: float = Field(default=0.7)
    max_tokens: int = Field(default=2000)

llm_client = LLMClient()
