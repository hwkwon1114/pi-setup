# Resources that a linked install symlinks into the pi agent home.
# Paths are relative to the repo; the link name is the basename.
# settings.json is deliberately absent: pi writes machine keys into it.
PI_LINK_DIRS=(skills extensions roles agents packages)
PI_LINK_FILES=(config/AGENTS.md config/models.json config/mcp.json)
