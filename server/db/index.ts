import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || './data/conversations.db';

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
// Enable foreign key constraints
db.pragma('foreign_keys = ON');

// Initialize schema (embedded to avoid file copy issues)
const schema = `
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
  search_metadata TEXT,
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

-- Documents table (stores metadata for uploaded files)
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at INTEGER NOT NULL,
  processed_at INTEGER,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

-- Document associations (supports both conversation-level and node-level attachments)
CREATE TABLE IF NOT EXISTS document_associations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  node_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES conversation_nodes(id) ON DELETE CASCADE,
  UNIQUE(document_id, node_id)
);

-- Document chunks (text segments for RAG)
CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  page_number INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Document embeddings (vector representations for semantic search)
CREATE TABLE IF NOT EXISTS document_embeddings (
  chunk_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (chunk_id) REFERENCES document_chunks(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_nodes_chat_id ON conversation_nodes(chat_id);
CREATE INDEX IF NOT EXISTS idx_node_parents_node ON node_parents(node_id);
CREATE INDEX IF NOT EXISTS idx_node_parents_parent ON node_parents(parent_id);
CREATE INDEX IF NOT EXISTS idx_branch_summaries_node ON branch_summaries(node_id);
CREATE INDEX IF NOT EXISTS idx_documents_chat_id ON documents(chat_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_doc_assoc_chat ON document_associations(chat_id);
CREATE INDEX IF NOT EXISTS idx_doc_assoc_node ON document_associations(node_id);
CREATE INDEX IF NOT EXISTS idx_doc_assoc_doc ON document_associations(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
`;

db.exec(schema);

// Migration: Add search_metadata column if it doesn't exist (for existing databases)
try {
  db.exec('ALTER TABLE conversation_nodes ADD COLUMN search_metadata TEXT');
} catch {
  // Column already exists, ignore error
}

// Migration: Add context management columns if they don't exist
try {
  db.exec('ALTER TABLE conversation_nodes ADD COLUMN is_summary INTEGER DEFAULT 0');
} catch {
  // Column already exists, ignore error
}

try {
  db.exec('ALTER TABLE conversation_nodes ADD COLUMN summarized_node_ids TEXT');
} catch {
  // Column already exists, ignore error
}

try {
  db.exec('ALTER TABLE conversation_nodes ADD COLUMN exclude_from_context INTEGER DEFAULT 0');
} catch {
  // Column already exists, ignore error
}

try {
  db.exec('ALTER TABLE conversation_nodes ADD COLUMN estimated_tokens INTEGER');
} catch {
  // Column already exists, ignore error
}

try {
  db.exec('ALTER TABLE chats ADD COLUMN system_prompt TEXT');
} catch {
  // Column already exists, ignore error
}

try {
  db.exec('ALTER TABLE chats ADD COLUMN custom_summary_prompt TEXT');
} catch {
  // Column already exists, ignore error
}

// Migration: Add variation tracking columns if they don't exist
try {
  db.exec('ALTER TABLE conversation_nodes ADD COLUMN is_variation INTEGER DEFAULT 0');
} catch {
  // Column already exists, ignore error
}

try {
  db.exec('ALTER TABLE conversation_nodes ADD COLUMN original_node_id TEXT');
} catch {
  // Column already exists, ignore error
}

// Create indexes for context management queries
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_nodes_exclude_context ON conversation_nodes(exclude_from_context)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_nodes_is_summary ON conversation_nodes(is_summary)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_nodes_is_variation ON conversation_nodes(is_variation)');
} catch {
  // Indexes already exist, ignore error
}

console.log(`Database initialized at ${DB_PATH}`);

export default db;
