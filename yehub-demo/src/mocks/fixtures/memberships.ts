import type { Membership } from '@/types/auth'

export const mockMemberships: Membership[] = [
  // proj-1: Vinamilk - Q1 2026
  { id: 'mem-1', userId: 'user-2', scope: 'project', scopeId: 'proj-1', role: 'manager', addedAt: '2025-10-01T00:00:00Z', addedBy: 'user-1' },
  { id: 'mem-2', userId: 'user-3', scope: 'project', scopeId: 'proj-1', role: 'analyst', addedAt: '2025-10-05T00:00:00Z', addedBy: 'user-2' },
  { id: 'mem-3', userId: 'user-4', scope: 'project', scopeId: 'proj-1', role: 'viewer', addedAt: '2025-10-10T00:00:00Z', addedBy: 'user-2' },
  { id: 'mem-4', userId: 'user-5', scope: 'project', scopeId: 'proj-1', role: 'analyst', addedAt: '2025-10-15T00:00:00Z', addedBy: 'user-2' },

  // proj-2: Grab Vietnam
  { id: 'mem-5', userId: 'user-2', scope: 'project', scopeId: 'proj-2', role: 'manager', addedAt: '2025-09-16T00:00:00Z', addedBy: 'user-1' },
  { id: 'mem-6', userId: 'user-3', scope: 'project', scopeId: 'proj-2', role: 'viewer', addedAt: '2025-09-20T00:00:00Z', addedBy: 'user-2' },
  { id: 'mem-7', userId: 'user-6', scope: 'project', scopeId: 'proj-2', role: 'manager', addedAt: '2025-09-15T00:00:00Z', addedBy: 'user-1' },

  // proj-3: Shopee Tết 2026
  { id: 'mem-8', userId: 'user-2', scope: 'project', scopeId: 'proj-3', role: 'manager', addedAt: '2025-11-01T00:00:00Z', addedBy: 'user-1' },
  { id: 'mem-9', userId: 'user-5', scope: 'project', scopeId: 'proj-3', role: 'manager', addedAt: '2025-11-02T00:00:00Z', addedBy: 'user-2' },
  { id: 'mem-10', userId: 'user-6', scope: 'project', scopeId: 'proj-3', role: 'executive', addedAt: '2025-11-05T00:00:00Z', addedBy: 'user-2' },

  // proj-4: VinFast - VF Series
  { id: 'mem-11', userId: 'user-3', scope: 'project', scopeId: 'proj-4', role: 'manager', addedAt: '2025-08-20T00:00:00Z', addedBy: 'user-1' },
  { id: 'mem-12', userId: 'user-7', scope: 'project', scopeId: 'proj-4', role: 'viewer', addedAt: '2025-09-01T00:00:00Z', addedBy: 'user-3' },
  { id: 'mem-13', userId: 'user-5', scope: 'project', scopeId: 'proj-4', role: 'manager', addedAt: '2025-08-22T00:00:00Z', addedBy: 'user-3' },

  // proj-5: Highlands Coffee
  { id: 'mem-14', userId: 'user-2', scope: 'project', scopeId: 'proj-5', role: 'manager', addedAt: '2025-12-01T00:00:00Z', addedBy: 'user-1' },
  { id: 'mem-15', userId: 'user-4', scope: 'project', scopeId: 'proj-5', role: 'viewer', addedAt: '2025-12-05T00:00:00Z', addedBy: 'user-2' },

  // proj-6: Viettel Telecom
  { id: 'mem-16', userId: 'user-6', scope: 'project', scopeId: 'proj-6', role: 'manager', addedAt: '2025-07-15T00:00:00Z', addedBy: 'user-1' },
  { id: 'mem-17', userId: 'user-5', scope: 'project', scopeId: 'proj-6', role: 'viewer', addedAt: '2025-08-01T00:00:00Z', addedBy: 'user-6' },

  // proj-7: The Coffee House (archived)
  { id: 'mem-18', userId: 'user-3', scope: 'project', scopeId: 'proj-7', role: 'manager', addedAt: '2025-11-10T00:00:00Z', addedBy: 'user-1' },
  { id: 'mem-19', userId: 'user-7', scope: 'project', scopeId: 'proj-7', role: 'analyst', addedAt: '2025-11-12T00:00:00Z', addedBy: 'user-3' },

  // proj-8: Lazada Summer (archived)
  { id: 'mem-20', userId: 'user-2', scope: 'project', scopeId: 'proj-8', role: 'manager', addedAt: '2025-05-01T00:00:00Z', addedBy: 'user-1' },

  // proj-9: Samsung Galaxy
  { id: 'mem-21', userId: 'user-5', scope: 'project', scopeId: 'proj-9', role: 'manager', addedAt: '2026-01-05T00:00:00Z', addedBy: 'user-1' },
  { id: 'mem-22', userId: 'user-6', scope: 'project', scopeId: 'proj-9', role: 'executive', addedAt: '2026-01-07T00:00:00Z', addedBy: 'user-5' },

  // proj-10: Masan Consumer
  { id: 'mem-23', userId: 'user-2', scope: 'project', scopeId: 'proj-10', role: 'manager', addedAt: '2025-06-20T00:00:00Z', addedBy: 'user-1' },
  { id: 'mem-24', userId: 'user-3', scope: 'project', scopeId: 'proj-10', role: 'analyst', addedAt: '2025-06-25T00:00:00Z', addedBy: 'user-2' },

  // ---- Campaign-level memberships (users NOT in the parent project) ----

  // user-7 gets viewer access to camp-6 (GrabFood Promo, proj-2) — user-7 is NOT a member of proj-2
  { id: 'mem-25', userId: 'user-7', scope: 'campaign', scopeId: 'camp-6', role: 'viewer', addedAt: '2026-01-12T00:00:00Z', addedBy: 'user-2' },

  // user-4 gets viewer access to camp-13 (VF 7 Launch, proj-4) — user-4 is NOT a member of proj-4
  { id: 'mem-26', userId: 'user-4', scope: 'campaign', scopeId: 'camp-13', role: 'viewer', addedAt: '2026-01-10T00:00:00Z', addedBy: 'user-3' },

  // user-7 gets analyst access to camp-23 (Galaxy S26, proj-9) — user-7 is NOT a member of proj-9
  { id: 'mem-27', userId: 'user-7', scope: 'campaign', scopeId: 'camp-23', role: 'analyst', addedAt: '2026-01-20T00:00:00Z', addedBy: 'user-5' },

  // user-4 gets manager access to camp-17 (5G Launch, proj-6) — user-4 is NOT a member of proj-6
  { id: 'mem-28', userId: 'user-4', scope: 'campaign', scopeId: 'camp-17', role: 'manager', addedAt: '2026-01-08T00:00:00Z', addedBy: 'user-6' },

  // user-6 gets viewer access to camp-25 (Chin-su, proj-10) — user-6 is NOT a member of proj-10
  { id: 'mem-29', userId: 'user-6', scope: 'campaign', scopeId: 'camp-25', role: 'viewer', addedAt: '2026-01-10T00:00:00Z', addedBy: 'user-2' },

  // user-3 gets analyst access to camp-15 (Phin Freeze, proj-5) — user-3 is NOT a member of proj-5
  { id: 'mem-30', userId: 'user-3', scope: 'campaign', scopeId: 'camp-15', role: 'analyst', addedAt: '2026-01-22T00:00:00Z', addedBy: 'user-2' },
]
