import { apiClient } from '@/api/axios';
import { env } from '@/config/env';

const NAMES = [
  ['Aarav Mehta', 'aarav@nova.dev', 'Admin'],
  ['Maya Shah', 'maya@nova.dev', 'Manager'],
  ['Rohan Iyer', 'rohan@nova.dev', 'Member'],
  ['Sara Khan', 'sara@nova.dev', 'Member'],
  ['Ishaan Patel', 'ishaan@nova.dev', 'Manager'],
  ['Nina Roy', 'nina@nova.dev', 'Member'],
  ['Kabir Joshi', 'kabir@nova.dev', 'Member'],
  ['Aditi Rao', 'aditi@nova.dev', 'Member'],
  ['Dev Malhotra', 'dev@nova.dev', 'Manager'],
  ['Zoya Ali', 'zoya@nova.dev', 'Member'],
  ['Vihaan Desai', 'vihaan@nova.dev', 'Member'],
  ['Anaya Singh', 'anaya@nova.dev', 'Member'],
];

const MOCK_USERS = NAMES.map(([name, email, role], index) => ({
  id: `usr_${String(index + 1).padStart(3, '0')}`,
  name,
  email,
  role,
  status: index === 7 ? 'Invited' : index === 10 ? 'Suspended' : 'Active',
  lastActive: `${index + 1}h ago`,
}));

const wait = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));

export const usersApi = {
  async list({ page = 1, pageSize = 8, search = '' } = {}) {
    if (!env.features.mockApi) {
      const response = await apiClient.get('/users', { params: { page, pageSize, search } });
      return response.data?.data ?? response.data;
    }
    await wait();
    const normalized = search.trim().toLowerCase();
    const filtered = normalized
      ? MOCK_USERS.filter((user) =>
          `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(normalized),
        )
      : MOCK_USERS;
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      meta: {
        page,
        pageSize,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / pageSize),
      },
    };
  },
};
