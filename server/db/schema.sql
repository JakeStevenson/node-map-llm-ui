-- Chats table
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled',
  active_node_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Conversation nodes table
CREATE TABLE IF NOT EXISTS conversation_nodes (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tree_id TEXT NOT NULL DEFAULT 'main',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

-- Node parents table (for DAG support with multiple parents)
CREATE TABLE IF NOT EXISTS node_parents (
  node_id TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (node_id, parent_id),
  FOREIGN KEY (node_id) REFERENCES conversation_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES conversation_nodes(id) ON DELETE CASCADE
);

-- Branch summaries table (for merge nodes)
CREATE TABLE IF NOT EXISTS branch_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  FOREIGN KEY (node_id) REFERENCES conversation_nodes(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_nodes_chat_id ON conversation_nodes(chat_id);
CREATE INDEX IF NOT EXISTS idx_node_parents_node ON node_parents(node_id);
CREATE INDEX IF NOT EXISTS idx_node_parents_parent ON node_parents(parent_id);
CREATE INDEX IF NOT EXISTS idx_branch_summaries_node ON branch_summaries(node_id);
