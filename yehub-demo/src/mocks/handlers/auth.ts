import { http, HttpResponse } from 'msw'
import { mockUsers } from '@/mocks/fixtures/users'

export const authHandlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string }
    const user = mockUsers.find(u => u.email === body.email)

    if (!user || body.password !== 'password') {
      return HttpResponse.json(
        { message: 'Invalid credentials' },
        { status: 401 }
      )
    }

    return HttpResponse.json({
      token: `mock-jwt-token-${user.id}-${Date.now()}`,
      user,
    })
  }),
]
