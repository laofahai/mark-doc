import { invoke } from '@tauri-apps/api/core'

export interface NativeFileDialogFilter {
  name: string
  extensions: string[]
}

export interface NativeOpenDialogOptions {
  defaultPath?: string
  filters?: NativeFileDialogFilter[]
}

export interface NativeSaveDialogOptions {
  defaultPath?: string
  filters?: NativeFileDialogFilter[]
}

export interface NativeDirEntry {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
}

export function selectDocumentFile(options?: NativeOpenDialogOptions) {
  return invoke<string | null>('select_document_file', { options })
}

export function selectDocumentFolder() {
  return invoke<string | null>('select_document_folder')
}

export function selectSavePath(options: NativeSaveDialogOptions) {
  return invoke<string | null>('select_save_path', { options })
}

export function authorizeDocumentPath(path: string) {
  return invoke<string>('authorize_document_path', { path })
}

export function readTextFile(path: string) {
  return invoke<string>('read_text_file', { path })
}

export function writeTextFile(path: string, contents: string) {
  return invoke<void>('write_text_file', { path, contents })
}

export function copyFile(sourcePath: string, targetPath: string) {
  return invoke<number>('copy_file', { sourcePath, targetPath })
}

export function removeFile(path: string) {
  return invoke<void>('remove_file', { path })
}

export function readDir(path: string) {
  return invoke<NativeDirEntry[]>('read_dir', { path })
}
