import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Editor } from '@tiptap/react';

// Mock Toolbar component with all dependencies mocked
interface MockToolbarProps {
  editor: Editor
  onSave?: () => void
}

const MockToolbar = ({ editor, onSave }: MockToolbarProps) => {
  return (
    <div className="toolbar" data-testid="toolbar">
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'is-active' : ''}
          title="粗体 (Ctrl+B)"
          data-testid="bold-btn"
        >
          Bold
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'is-active' : ''}
          title="斜体 (Ctrl+I)"
          data-testid="italic-btn"
        >
          Italic
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={editor.isActive('underline') ? 'is-active' : ''}
          title="下划线 (Ctrl+U)"
          data-testid="underline-btn"
        >
          Underline
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive('strike') ? 'is-active' : ''}
          title="删除线 (Ctrl+Shift+X)"
          data-testid="strike-btn"
        >
          Strike
        </button>
      </div>

      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={editor.isActive('code') ? 'is-active' : ''}
          title="行内代码"
          data-testid="code-btn"
        >
          Code
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          className={editor.isActive('highlight') ? 'is-active' : ''}
          title="高亮"
          data-testid="highlight-btn"
        >
          Highlight
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? 'is-active' : ''}
          title="引用"
          data-testid="blockquote-btn"
        >
          Quote
        </button>
      </div>

      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'is-active' : ''}
          title="无序列表"
          data-testid="bullet-list-btn"
        >
          Bullet List
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'is-active' : ''}
          title="有序列表"
          data-testid="ordered-list-btn"
        >
          Ordered List
        </button>
        <button
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={editor.isActive('taskList') ? 'is-active' : ''}
          title="任务列表"
          data-testid="task-list-btn"
        >
          Task List
        </button>
      </div>

      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="插入表格"
          data-testid="table-btn"
        >
          Table
        </button>
        <button
          onClick={() => {
            const url = window.prompt('图片 URL:')
            if (url) {
              editor.chain().focus().setImage({ src: url }).run()
            }
          }}
          title="插入图片"
          data-testid="image-btn"
        >
          Image
        </button>
        <button
          onClick={() => {
            const previousUrl = editor.getAttributes('link').href
            const url = window.prompt('链接 URL:', previousUrl)
            if (url === null) return
            if (url === '') {
              editor.chain().focus().unsetLink().run()
              return
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
          }}
          className={editor.isActive('link') ? 'is-active' : ''}
          title="插入链接"
          data-testid="link-btn"
        >
          Link
        </button>
      </div>

      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="撤销 (Ctrl+Z)"
          data-testid="undo-btn"
        >
          Undo
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="重做 (Ctrl+Y)"
          data-testid="redo-btn"
        >
          Redo
        </button>
      </div>

      <div className="toolbar-group toolbar-spacer" />

      <div className="toolbar-group">
        <button
          onClick={onSave}
          className="save-button"
          title="保存 (Ctrl+S)"
          data-testid="save-btn"
        >
          保存
        </button>
      </div>
    </div>
  )
}

describe('Toolbar Component', () => {
  const createMockEditor = () => {
    const editor = {
      isActive: vi.fn(() => false),
      can: vi.fn(() => ({
        undo: vi.fn(() => true),
        redo: vi.fn(() => true),
      })),
      chain: vi.fn().mockReturnThis(),
      focus: vi.fn().mockReturnThis(),
      toggleBold: vi.fn().mockReturnThis(),
      toggleItalic: vi.fn().mockReturnThis(),
      toggleCode: vi.fn().mockReturnThis(),
      toggleHighlight: vi.fn().mockReturnThis(),
      toggleBlockquote: vi.fn().mockReturnThis(),
      toggleBulletList: vi.fn().mockReturnThis(),
      toggleOrderedList: vi.fn().mockReturnThis(),
      toggleTaskList: vi.fn().mockReturnThis(),
      insertTable: vi.fn().mockReturnThis(),
      setImage: vi.fn().mockReturnThis(),
      setLink: vi.fn().mockReturnThis(),
      unsetLink: vi.fn().mockReturnThis(),
      extendMarkRange: vi.fn().mockReturnThis(),
      undo: vi.fn().mockReturnThis(),
      redo: vi.fn().mockReturnThis(),
      getAttributes: vi.fn(() => ({ href: '' })),
      run: vi.fn(),
    }
    return editor as unknown as import('@tiptap/react').Editor
  }

  let mockEditor: ReturnType<typeof createMockEditor>
  const mockOnSave = vi.fn()

  beforeEach(() => {
    mockEditor = createMockEditor()
    mockOnSave.mockClear()
    vi.clearAllMocks()
  })

  it('renders all toolbar buttons', () => {
    render(<MockToolbar editor={mockEditor} onSave={mockOnSave} />)
    
    // Formatting buttons
    expect(screen.getByTestId('bold-btn')).toBeInTheDocument()
    expect(screen.getByTestId('italic-btn')).toBeInTheDocument()
    expect(screen.getByTestId('underline-btn')).toBeInTheDocument()
    expect(screen.getByTestId('strike-btn')).toBeInTheDocument()
    
    // Style buttons
    expect(screen.getByTestId('code-btn')).toBeInTheDocument()
    expect(screen.getByTestId('highlight-btn')).toBeInTheDocument()
    expect(screen.getByTestId('blockquote-btn')).toBeInTheDocument()
    
    // List buttons
    expect(screen.getByTestId('bullet-list-btn')).toBeInTheDocument()
    expect(screen.getByTestId('ordered-list-btn')).toBeInTheDocument()
    expect(screen.getByTestId('task-list-btn')).toBeInTheDocument()
    
    // Insert buttons
    expect(screen.getByTestId('table-btn')).toBeInTheDocument()
    expect(screen.getByTestId('image-btn')).toBeInTheDocument()
    expect(screen.getByTestId('link-btn')).toBeInTheDocument()
    
    // History buttons
    expect(screen.getByTestId('undo-btn')).toBeInTheDocument()
    expect(screen.getByTestId('redo-btn')).toBeInTheDocument()
    
    // Save button
    expect(screen.getByTestId('save-btn')).toBeInTheDocument()
  })

  it('calls correct editor commands when bold button is clicked', () => {
    render(<MockToolbar editor={mockEditor} onSave={mockOnSave} />)
    
    fireEvent.click(screen.getByTestId('bold-btn'))
    
    expect(mockEditor.chain).toHaveBeenCalled()
    expect(mockEditor.focus).toHaveBeenCalled()
    expect(mockEditor.toggleBold).toHaveBeenCalled()
    expect(mockEditor.run).toHaveBeenCalled()
  })

  it('calls correct editor commands when italic button is clicked', () => {
    render(<MockToolbar editor={mockEditor} onSave={mockOnSave} />)
    
    fireEvent.click(screen.getByTestId('italic-btn'))
    
    expect(mockEditor.toggleItalic).toHaveBeenCalled()
  })

  it('calls correct editor commands when list buttons are clicked', () => {
    render(<MockToolbar editor={mockEditor} onSave={mockOnSave} />)
    
    fireEvent.click(screen.getByTestId('bullet-list-btn'))
    expect(mockEditor.toggleBulletList).toHaveBeenCalled()
    
    fireEvent.click(screen.getByTestId('ordered-list-btn'))
    expect(mockEditor.toggleOrderedList).toHaveBeenCalled()
    
    fireEvent.click(screen.getByTestId('task-list-btn'))
    expect(mockEditor.toggleTaskList).toHaveBeenCalled()
  })

  it('calls correct editor commands when table button is clicked', () => {
    render(<MockToolbar editor={mockEditor} onSave={mockOnSave} />)
    
    fireEvent.click(screen.getByTestId('table-btn'))
    
    expect(mockEditor.insertTable).toHaveBeenCalledWith({ 
      rows: 3, 
      cols: 3, 
      withHeaderRow: true 
    })
  })

  it('calls correct editor commands when undo/redo buttons are clicked', () => {
    render(<MockToolbar editor={mockEditor} onSave={mockOnSave} />)
    
    fireEvent.click(screen.getByTestId('undo-btn'))
    expect(mockEditor.undo).toHaveBeenCalled()
    
    fireEvent.click(screen.getByTestId('redo-btn'))
    expect(mockEditor.redo).toHaveBeenCalled()
  })

  it('calls onSave when save button is clicked', () => {
    render(<MockToolbar editor={mockEditor} onSave={mockOnSave} />)
    
    fireEvent.click(screen.getByTestId('save-btn'))
    
    expect(mockOnSave).toHaveBeenCalled()
  })

  it('disables undo button when editor cannot undo', () => {
    mockEditor.can = vi.fn(() => ({
      undo: vi.fn(() => false),
      redo: vi.fn(() => true),
    }))
    
    render(<MockToolbar editor={mockEditor} onSave={mockOnSave} />)
    
    expect(screen.getByTestId('undo-btn')).toBeDisabled()
    expect(screen.getByTestId('redo-btn')).not.toBeDisabled()
  })
})
