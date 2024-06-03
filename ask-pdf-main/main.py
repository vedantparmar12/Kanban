from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_community.document_loaders import TextLoader
from langchain_community.embeddings.sentence_transformer import (
    SentenceTransformerEmbeddings,
)
loader = PyPDFLoader("/workspaces/ask-cv/H. Versteeg, W. Malalasekra - An Introduction to Computational Fluid Dynamics_ The Finite Volume Method (2nd Edition)  -Prentice Hall (2007).pdf")
pages = loader.load_and_split()
print(pages[0])
# This is a long document we can split up.
with open("/workspaces/ask-cv/H. Versteeg, W. Malalasekra - An Introduction to Computational Fluid Dynamics_ The Finite Volume Method (2nd Edition)  -Prentice Hall (2007).pdf") as f:
    state_of_the_union = f.read()
    
embedding_function = SentenceTransformerEmbeddings(model_name="all-MiniLM-L6-v2")

# load it into Chroma
db = Chroma.from_documents(docs, embedding_function)

# query it
query = "What did the president say about Ketanji Brown Jackson"
docs = db.similarity_search(query)

# print results
print(docs[0].page_content)