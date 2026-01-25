import uvicorn
import sys
import asyncio

# 1. Force the Window Proactor Loop Policy
# We do this BEFORE any other imports or logic run
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

if __name__ == "__main__":
    # 2. Run Uvicorn Programmatically
    # "main:app" refers to file 'main.py' and object 'app'
    # loop="asyncio" forces it to use the policy we just set
    print("🚀 Starting Server with Windows Proactor Loop...")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True, loop="asyncio")