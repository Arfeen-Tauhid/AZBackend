import type { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { AdminModel } from '../models/index.js'
import { HttpError } from './errors.js'
import { canAccessAdminPath, type AdminRole } from './adminAccess.js'

declare global {
  namespace Express {
    interface Request {
      adminId?: string
      adminRole?: AdminRole
      adminPermissions?: string[]
    }
  }
}

export const requireAdmin: RequestHandler = async (request, _response, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const origin = request.get('origin')
    if (origin !== env.FRONTEND_ORIGIN) {
      next(new HttpError(403, 'This request origin is not allowed.'))
      return
    }
  }

  const token = request.cookies?.az_admin
  if (!token) {
    next(new HttpError(401, 'Authentication is required.'))
    return
  }

  let payload: jwt.JwtPayload
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET)
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      throw new Error('Invalid admin token payload.')
    }
    payload = decoded
  } catch {
    next(new HttpError(401, 'Your admin session is invalid or expired.'))
    return
  }

  const admin = await AdminModel.findById(payload.sub).select('role permissions').lean()
  if (!admin) {
    next(new HttpError(401, 'Admin account not found.'))
    return
  }
  request.adminId = payload.sub
  request.adminRole = admin.role
  request.adminPermissions = admin.permissions ?? []
  next()
}

export const requireOwner: RequestHandler = (request, _response, next) => {
  if (request.adminRole !== 'owner') {
    next(new HttpError(403, 'Owner access is required for this action.'))
    return
  }
  next()
}

export const requireAdminResourceAccess: RequestHandler = (request, _response, next) => {
  if (
    request.adminRole &&
    !canAccessAdminPath(
      request.adminRole,
      request.adminPermissions ?? [],
      request.method,
      request.path,
      request.body?.resourceType,
    )
  ) {
    next(new HttpError(403, 'Your limited admin role cannot access this section or action.'))
    return
  }
  next()
}
