import type { TodosService } from '../services/todos.service';
import type { ProjectsService } from '../services/projects.service';
import type { Priority } from '../types/todo';

interface MockTodo {
  title: string;
  importance: Priority;
  urgency: Priority;
  tags?: string[];
  projectId?: string;
  milestoneId?: string;
  done?: boolean;
}

export function seedMockData(todos: TodosService, projects: ProjectsService): void {
  todos.reset();
  projects.reset();

  const website = projects.addProject({
    icon: '🌐',
    name: 'Website Relaunch',
    description: 'Refresh the marketing site',
    notes: '',
  });
  const design = projects.addMilestone(website.id, 'Design');
  const development = projects.addMilestone(website.id, 'Development');

  const personal = projects.addProject({
    icon: '🧘',
    name: 'Personal',
    description: 'Life admin',
    notes: '',
  });
  const health = projects.addMilestone(personal.id, 'Health');

  const seed: MockTodo[] = [
    { title: 'Fix checkout bug', importance: 'high', urgency: 'high', tags: ['bug'], projectId: website.id, milestoneId: development.id },
    { title: 'Respond to investor email', importance: 'high', urgency: 'high', tags: ['email'] },
    { title: 'Draft Q3 roadmap', importance: 'high', urgency: 'low', projectId: website.id },
    { title: 'Learn Rust basics', importance: 'medium', urgency: 'low', tags: ['learning'] },
    { title: 'Answer support ticket #482', importance: 'low', urgency: 'high', tags: ['support'] },
    { title: 'Approve pending PR', importance: 'low', urgency: 'medium', projectId: website.id, milestoneId: development.id },
    { title: 'Reorganize bookmarks', importance: 'low', urgency: 'low' },
    { title: 'Clean inbox', importance: 'low', urgency: 'low', tags: ['admin'] },
    { title: 'New homepage mockups', importance: 'medium', urgency: 'medium', projectId: website.id, milestoneId: design.id },
    { title: 'Book dentist appointment', importance: 'medium', urgency: 'medium', projectId: personal.id, milestoneId: health.id },
    { title: 'Renew gym membership', importance: 'medium', urgency: 'high', projectId: personal.id, milestoneId: health.id, done: true },
  ];

  for (const item of seed) {
    todos.addTodo({
      title: item.title,
      importance: item.importance,
      urgency: item.urgency,
      tags: item.tags ?? [],
      projectId: item.projectId,
      milestoneId: item.milestoneId,
    });
    if (item.done) {
      const list = todos.todos();
      const added = list[list.length - 1];
      todos.toggleDone(added.id);
    }
  }
}
