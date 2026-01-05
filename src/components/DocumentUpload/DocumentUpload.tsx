import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useConversationStore } from '../../store/conversationStore';
import type { Document } from '../../types';

interface DocumentUploadProps {
  nodeId?: string;
  onUploadComplete?: (document: Document) => void;
}

const ALLOWED_TYPES = {
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export default function DocumentUpload({ nodeId, onUploadComplete }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadDocument = useConversationStore((state) => state.uploadDocument);
  const documents = useConversationStore((state) => state.documents);

  // Filter documents based on nodeId
  const relevantDocuments = nodeId
    ? documents.filter((doc) => doc.nodeId === nodeId)
    : documents.filter((doc) => !doc.nodeId);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) {
        return;
      }

      const file = acceptedFiles[0]; // Handle one file at a time for MVP

      setUploading(true);
      setError(null);

      try {
        const document = await uploadDocument(file, nodeId);
        onUploadComplete?.(document);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [uploadDocument, nodeId, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_TYPES,
    maxSize: MAX_SIZE,
    multiple: false,
  });

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="space-y-2">
          <div className="text-4xl">📎</div>
          {uploading ? (
            <p className="text-sm text-gray-600">Uploading...</p>
          ) : isDragActive ? (
            <p className="text-sm text-blue-600">Drop file here</p>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Drag & drop a file here, or click to browse
              </p>
              <p className="text-xs text-gray-500">
                PDF, Word, Excel, PowerPoint, Text, Markdown, Images (max 50MB)
              </p>
            </>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Document List */}
      {relevantDocuments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">
            {nodeId ? 'Node Documents' : 'Conversation Documents'}
          </h3>
          <div className="space-y-2">
            {relevantDocuments.map((doc) => (
              <DocumentItem key={doc.id} document={doc} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface DocumentItemProps {
  document: Document;
}

function DocumentItem({ document }: DocumentItemProps) {
  const deleteDocument = useConversationStore((state) => state.deleteDocument);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete ${document.fileName}?`)) {
      return;
    }

    setDeleting(true);
    try {
      await deleteDocument(document.id);
    } catch (err) {
      console.error('Failed to delete document:', err);
    } finally {
      setDeleting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = () => {
    switch (document.status) {
      case 'pending':
        return <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">Pending</span>;
      case 'processing':
        return <span className="text-xs bg-amber-200 text-amber-700 px-2 py-1 rounded">Processing</span>;
      case 'ready':
        return <span className="text-xs bg-green-200 text-green-700 px-2 py-1 rounded">Ready</span>;
      case 'failed':
        return <span className="text-xs bg-red-200 text-red-700 px-2 py-1 rounded">Failed</span>;
      default:
        return null;
    }
  };

  const getFileIcon = () => {
    if (document.mimeType.startsWith('image/')) return '🖼️';
    if (document.mimeType.includes('pdf')) return '📄';
    if (document.mimeType.includes('word')) return '📝';
    if (document.mimeType.includes('sheet')) return '📊';
    if (document.mimeType.includes('presentation')) return '📽️';
    return '📎';
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <span className="text-2xl">{getFileIcon()}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{document.fileName}</p>
        <p className="text-xs text-gray-500">
          {formatFileSize(document.fileSize)} • {new Date(document.createdAt).toLocaleDateString()}
        </p>
        {document.errorMessage && (
          <p className="text-xs text-red-600 mt-1">{document.errorMessage}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {getStatusBadge()}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-red-600 hover:text-red-700 text-sm disabled:opacity-50"
        >
          {deleting ? '...' : '🗑️'}
        </button>
      </div>
    </div>
  );
}
