export interface Project {
  slug: string;
  name: string;
  description: string;
  path: string;
  language?: string;
  lastModified?: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  status?: "added" | "modified" | "deleted";
  size?: number;
}

export interface FileContent {
  content: string;
  language: string;
  size: number;
  isBinary: boolean;
  path: string;
  name: string;
}
