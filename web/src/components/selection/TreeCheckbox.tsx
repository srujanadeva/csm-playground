// A tree of checkboxes: checking a parent checks every leaf under it; a parent with some leaves
// checked is half-checked (the checkbox's `indeterminate` property, which has no HTML attribute,
// so tests must read the property or aria-checked="mixed" on the tree item).
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './selection.css'

export interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
}

/** Every leaf id under a node (the node itself when it is a leaf). */
export function leafIds(node: TreeNode): string[] {
  return node.children?.length ? node.children.flatMap(leafIds) : [node.id]
}

interface Props {
  nodes: TreeNode[]
  /** Checked leaf ids. */
  checked: string[]
  onChange: (leafIds: string[]) => void
  label: string
  disabled?: boolean
  /** Node ids expanded at first. */
  initiallyExpanded?: string[]
}

/** The tree (role="tree"). */
export function TreeCheckbox({ nodes, checked, onChange, label, disabled, initiallyExpanded = [] }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initiallyExpanded))
  const set = new Set(checked)
  const toggleNode = (node: TreeNode, on: boolean) => {
    const ids = leafIds(node)
    const next = new Set(set)
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)))
    onChange([...next])
  }
  return (
    <ul className="tree" role="tree" aria-label={label}>
      {nodes.map((n) => (
        <Branch
          key={n.id}
          node={n}
          level={1}
          checked={set}
          expanded={expanded}
          disabled={disabled}
          onToggle={toggleNode}
          onExpand={(id) =>
            setExpanded((e) => {
              const next = new Set(e)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }
        />
      ))}
    </ul>
  )
}

interface BranchProps {
  node: TreeNode
  level: number
  checked: Set<string>
  expanded: Set<string>
  disabled?: boolean
  onToggle: (node: TreeNode, on: boolean) => void
  onExpand: (id: string) => void
}

/** One tree item and, when expanded, its children. */
function Branch({ node, level, checked, expanded, disabled, onToggle, onExpand }: BranchProps) {
  const { t } = useTranslation('ui')
  const box = useRef<HTMLInputElement>(null)
  const leaves = leafIds(node)
  const count = leaves.filter((id) => checked.has(id)).length
  const state = count === 0 ? 'false' : count === leaves.length ? 'true' : 'mixed'
  const hasKids = !!node.children?.length
  const open = expanded.has(node.id)
  useEffect(() => {
    if (box.current) box.current.indeterminate = state === 'mixed'
  }, [state])
  return (
    <li
      role="treeitem"
      aria-level={level}
      aria-expanded={hasKids ? open : undefined}
      aria-checked={state}
      aria-selected={false}
    >
      <div className="tree-row">
        {hasKids ? (
          <button
            type="button"
            className="tree-twisty"
            aria-label={t(open ? 'tree.collapse' : 'tree.expand', { item: node.label })}
            onClick={() => onExpand(node.id)}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-twisty" aria-hidden />
        )}
        <label>
          <input
            ref={box}
            type="checkbox"
            checked={state === 'true'}
            disabled={disabled}
            onChange={(e) => onToggle(node, e.target.checked)}
          />
          <span>{node.label}</span>
        </label>
        {hasKids ? (
          <span className="help">
            {count}/{leaves.length}
          </span>
        ) : null}
      </div>
      {hasKids && open ? (
        <ul role="group">
          {node.children!.map((c) => (
            <Branch
              key={c.id}
              node={c}
              level={level + 1}
              checked={checked}
              expanded={expanded}
              disabled={disabled}
              onToggle={onToggle}
              onExpand={onExpand}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
