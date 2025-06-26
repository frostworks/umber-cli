# umber-cli
[RAG/MCP] umber-cli tool to import GitHub repository content into NodeBB

# Umber 
Coming soon! This isn't meant for production use, just a handy CLI tool to organize your life easier until we launch.

# Notes

npm i then `node umber.js import`

Check your topic tag counts and max post length in ACP first.

# Frostworks Workflow Hub Plugin for NodeBB

This tool can also additionally work in tandem with Frostworks FlowHub. Look here:
https://github.com/frostworks/nodebb-plugin-fw-hub

Collaborative JSON versioning system hosted as forum architecture. Great for managing ComfyUI Workflows, or any other node-based scripting language.

This plugin works in tandem with @frostworks/umber-cli. Not meant for production, simple dev tools for your MCP. This repo is 100% going to be revamped shortly so please fork with the knowledge that this is still in ALPHA. *Coming soon: Umber MCP Framework*


Push to NodeBB from GH/comfyui

```
> node umber.js hub push --title "ComfyUI node title" --message "ComfyUI node description" --file dummy.json
Pushing workflow to hub as form data...
> http://127.0.0.1:4567/api/v3/plugins/workflow

Success! Workflow pushed to hub.
- New Post ID (pid): 779
- Topic ID (tid): 764
  View topic at: http://127.0.0.1:4567/topic/764
```

Pull from NodeBB back to GH/comfyui
```
> node umber.js hub pull 779                                                      
Pulling workflow from PID 779...
> http://127.0.0.1:4567/api/v3/plugins/workflow/779

Success! Workflow saved to workflow-779.json
- Type: comfyui
- Metadata: {"source":"umber-cli","fileName":"dummy.json"}
```