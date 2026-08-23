import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useLocalStorage } from '../composables/useLocalStorage'
import type { Priority, Todo, TodoExport } from '../types/todo'

export interface TodoFilters {
  importance: Priority | 'all'
  urgency: Priority | 'all'
  tag: string | 'all'
}

function createId(): string {
  return crypto.randomUUID()
}

export type TodoViewMode = 'all' | 'projects'

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

export const useTodosStore = defineStore('todos', () => {
  const todos = useLocalStorage<Todo[]>('productivist.todos', [])
  const filters = useLocalStorage<TodoFilters>('productivist.todoFilters', {
    importance: 'all',
    urgency: 'all',
    tag: 'all',
  })
  const viewMode = useLocalStorage<TodoViewMode>('productivist.todoViewMode', 'all')
  const hasCustomOrder = useLocalStorage<boolean>('productivist.todosCustomOrder', false)

  function sortTasks(list: Todo[]): Todo[] {
    const sorted = [...list]
    if (hasCustomOrder.value) {
      return sorted.sort((a, b) => a.order - b.order)
    }
    return sorted.sort((a, b) => {
      const importanceDiff = PRIORITY_RANK[a.importance] - PRIORITY_RANK[b.importance]
      if (importanceDiff !== 0) return importanceDiff
      const urgencyDiff = PRIORITY_RANK[a.urgency] - PRIORITY_RANK[b.urgency]
      if (urgencyDiff !== 0) return urgencyDiff
      return a.order - b.order
    })
  }

  const allTags = computed(() => {
    const tags = new Set<string>()
    for (const todo of todos.value) {
      for (const tag of todo.tags) tags.add(tag)
    }
    return Array.from(tags).sort()
  })

  const filteredTodos = computed(() => {
    return sortTasks(
      todos.value
        .filter((todo) => !todo.done)
        .filter((todo) => filters.value.importance === 'all' || todo.importance === filters.value.importance)
        .filter((todo) => filters.value.urgency === 'all' || todo.urgency === filters.value.urgency)
        .filter((todo) => filters.value.tag === 'all' || todo.tags.includes(filters.value.tag)),
    )
  })

  const completedTodos = computed(() => {
    return todos.value
      .filter((todo) => todo.done)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  })

  const unassignedTodos = computed(() => {
    return sortTasks(todos.value.filter((todo) => !todo.done && !todo.projectId))
  })

  const draggedId = ref<string | null>(null)
  const currentTaskId = useLocalStorage<string | null>('productivist.currentTaskId', null)

  const currentTask = computed(() => {
    if (!currentTaskId.value) return null
    return todos.value.find((t) => t.id === currentTaskId.value && !t.done) ?? null
  })

  function setCurrentTask(id: string | null) {
    currentTaskId.value = id
  }

  function addTodo(input: {
    title: string
    importance: Priority
    urgency: Priority
    tags: string[]
    projectId?: string
    milestoneId?: string
  }) {
    const maxOrder = todos.value.reduce((max, t) => Math.max(max, t.order), -1)
    todos.value.push({
      id: createId(),
      title: input.title,
      importance: input.importance,
      urgency: input.urgency,
      tags: input.tags,
      done: false,
      order: maxOrder + 1,
      createdAt: Date.now(),
      projectId: input.projectId,
      milestoneId: input.milestoneId,
    })
  }

  function assignToMilestone(todoId: string, projectId: string, milestoneId: string) {
    const todo = todos.value.find((t) => t.id === todoId)
    if (!todo) return
    todo.projectId = projectId
    todo.milestoneId = milestoneId
  }

  function unassignFromProject(todoId: string) {
    const todo = todos.value.find((t) => t.id === todoId)
    if (!todo) return
    todo.projectId = undefined
    todo.milestoneId = undefined
  }

  function clearProjectRefs(projectId: string) {
    for (const todo of todos.value) {
      if (todo.projectId === projectId) {
        todo.projectId = undefined
        todo.milestoneId = undefined
      }
    }
  }

  function clearMilestoneRefs(milestoneId: string) {
    for (const todo of todos.value) {
      if (todo.milestoneId === milestoneId) {
        todo.milestoneId = undefined
      }
    }
  }

  function setViewMode(mode: TodoViewMode) {
    viewMode.value = mode
  }

  function removeTodo(id: string) {
    todos.value = todos.value.filter((todo) => todo.id !== id)
    if (currentTaskId.value === id) currentTaskId.value = null
  }

  function updateTodo(
    id: string,
    patch: Partial<Pick<Todo, 'title' | 'importance' | 'urgency' | 'tags' | 'projectId' | 'milestoneId'>>,
  ) {
    const todo = todos.value.find((t) => t.id === id)
    if (!todo) return
    Object.assign(todo, patch)
  }

  function toggleDone(id: string) {
    const todo = todos.value.find((t) => t.id === id)
    if (!todo) return
    todo.done = !todo.done
    todo.completedAt = todo.done ? Date.now() : undefined
    if (todo.done && currentTaskId.value === id) currentTaskId.value = null
  }

  function reorderTodoBefore(draggedTodoId: string, targetTodoId: string, before: boolean) {
    if (draggedTodoId === targetTodoId) return
    const sorted = sortTasks(todos.value.filter((t) => !t.done))
    const fromIndex = sorted.findIndex((t) => t.id === draggedTodoId)
    const targetIndex = sorted.findIndex((t) => t.id === targetTodoId)
    if (fromIndex === -1 || targetIndex === -1) return
    let insertIndex = before ? targetIndex : targetIndex + 1
    if (insertIndex > fromIndex) insertIndex -= 1
    if (insertIndex === fromIndex) return
    const [moved] = sorted.splice(fromIndex, 1)
    sorted.splice(insertIndex, 0, moved)
    sorted.forEach((todo, index) => {
      todo.order = index
    })
    hasCustomOrder.value = true
  }

  function startDrag(id: string) {
    draggedId.value = id
  }

  function dragOverTodo(targetId: string, before: boolean) {
    if (draggedId.value) reorderTodoBefore(draggedId.value, targetId, before)
  }

  function endDrag() {
    draggedId.value = null
  }

  function setFilters(next: Partial<TodoFilters>) {
    filters.value = { ...filters.value, ...next }
  }

  function exportTodos(): TodoExport {
    return { version: 1, todos: todos.value }
  }

  function importTodos(data: TodoExport) {
    if (!data || data.version !== 1 || !Array.isArray(data.todos)) {
      throw new Error('Invalid Productivist to-do file')
    }
    todos.value = data.todos
  }

  function reset() {
    todos.value = []
    filters.value = { importance: 'all', urgency: 'all', tag: 'all' }
    currentTaskId.value = null
    viewMode.value = 'all'
    hasCustomOrder.value = false
  }

  return {
    todos,
    filters,
    viewMode,
    hasCustomOrder,
    allTags,
    filteredTodos,
    completedTodos,
    unassignedTodos,
    draggedId,
    currentTaskId,
    currentTask,
    sortTasks,
    addTodo,
    updateTodo,
    removeTodo,
    toggleDone,
    startDrag,
    dragOverTodo,
    endDrag,
    setFilters,
    setViewMode,
    setCurrentTask,
    assignToMilestone,
    unassignFromProject,
    clearProjectRefs,
    clearMilestoneRefs,
    exportTodos,
    importTodos,
    reset,
  }
})
