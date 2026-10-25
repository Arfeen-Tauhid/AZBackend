export type AdminRole = 'owner' | 'full' | 'limited' | 'custom'

export type AdminPermission =
  'projects' | 'clients' | 'testimonials' | 'services' | 'site-settings' | 'inquiries' | 'ratings'

export function canAccessAdminPath(
  role: AdminRole,
  permissions: string[],
  method: string,
  path: string,
  resourceType?: string,
) {
  if (role === 'owner' || role === 'full') return true
  if (role === 'limited') {
    if (path === '/dashboard' && method === 'GET') return true
    if (
      ['/uploads/signature', '/uploads/verify'].includes(path) &&
      method === 'POST' &&
      (resourceType === 'image' || resourceType === 'video')
    ) {
      return true
    }
    const [legacyResource] = path.replace(/^\/+/, '').split('/')
    if (['projects', 'services'].includes(legacyResource))
      return ['GET', 'POST', 'PATCH', 'DELETE'].includes(method)
    if (['clients', 'testimonials', 'ratings'].includes(legacyResource)) return method === 'GET'
    return false
  }

  const allowed = (permission: string, readOnly = false) =>
    permissions.includes(permission) &&
    (method === 'GET' || (!readOnly && ['POST', 'PATCH', 'DELETE'].includes(method)))

  if (path === '/dashboard' && method === 'GET') return true

  if (['/uploads/signature', '/uploads/verify'].includes(path)) {
    if (method !== 'POST') return false
    const mediaPermissions =
      resourceType === 'video'
        ? ['projects', 'site-settings']
        : resourceType === 'image'
          ? ['projects', 'clients', 'testimonials']
          : []
    return mediaPermissions.some((permission) => allowed(permission))
  }

  const [resource] = path.replace(/^\/+/, '').split('/')
  if (
    ['projects', 'clients', 'testimonials', 'services', 'site-settings', 'ratings'].includes(
      resource,
    )
  )
    return allowed(resource)
  if (resource === 'inquiries') return allowed('inquiries')

  return false
}
