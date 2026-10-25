import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createAdminSchema,
  adminInquirySchema,
  adminInquiryUpdateSchema,
  clientSchema,
  inquirySchema,
  inquiryStatusSchema,
  projectSchema,
  publicRatingSchema,
  siteSettingsSchema,
} from '../src/validators/index.js'
import { getMediaPolicyError } from '../src/services/mediaPolicy.js'
import { canAccessAdminPath } from '../src/middleware/adminAccess.js'

describe('limited admin access', () => {
  it('allows editing projects and services and viewing approved content sections', () => {
    assert.equal(canAccessAdminPath('limited', [], 'PATCH', '/projects/abc123'), true)
    assert.equal(canAccessAdminPath('limited', [], 'POST', '/services'), true)
    assert.equal(canAccessAdminPath('limited', [], 'GET', '/clients'), true)
    assert.equal(canAccessAdminPath('limited', [], 'GET', '/testimonials'), true)
    assert.equal(canAccessAdminPath('limited', [], 'GET', '/dashboard'), true)
    assert.equal(canAccessAdminPath('limited', [], 'POST', '/uploads/signature', 'video'), true)
  })

  it('denies settings, inquiries, account management, and edits to read-only content', () => {
    assert.equal(canAccessAdminPath('limited', [], 'GET', '/site-settings'), false)
    assert.equal(canAccessAdminPath('limited', [], 'GET', '/inquiries'), false)
    assert.equal(canAccessAdminPath('limited', [], 'POST', '/admins'), false)
    assert.equal(canAccessAdminPath('limited', [], 'DELETE', '/clients/abc123'), false)
    assert.equal(canAccessAdminPath('limited', [], 'PATCH', '/testimonials/abc123'), false)
    assert.equal(canAccessAdminPath('limited', [], 'GET', '/ratings'), true)
    assert.equal(canAccessAdminPath('limited', [], 'DELETE', '/ratings/abc123'), false)
  })

  it('applies selected permissions independently on the server', () => {
    const permissions = ['testimonials']
    assert.equal(canAccessAdminPath('custom', permissions, 'GET', '/testimonials'), true)
    assert.equal(canAccessAdminPath('custom', permissions, 'PATCH', '/testimonials/abc123'), true)
    assert.equal(canAccessAdminPath('custom', permissions, 'GET', '/projects'), false)
    assert.equal(canAccessAdminPath('custom', permissions, 'PATCH', '/inquiries/abc123'), false)
    assert.equal(canAccessAdminPath('custom', ['ratings'], 'POST', '/ratings'), true)
    assert.equal(canAccessAdminPath('custom', ['ratings'], 'DELETE', '/ratings/abc123'), true)
    assert.equal(canAccessAdminPath('custom', permissions, 'GET', '/dashboard'), true)
    assert.equal(
      canAccessAdminPath('custom', permissions, 'POST', '/uploads/signature', 'image'),
      true,
    )
    assert.equal(
      canAccessAdminPath('custom', permissions, 'POST', '/uploads/signature', 'video'),
      false,
    )
    assert.equal(
      canAccessAdminPath('custom', permissions, 'GET', '/uploads/signature', 'image'),
      false,
    )
  })
})

describe('admin account validation', () => {
  it('requires a valid email, role, and strong initial password', () => {
    assert.equal(
      createAdminSchema.safeParse({
        email: 'editor@example.com',
        password: 'a-unique-admin-password',
        permissions: ['projects', 'testimonials', 'ratings'],
      }).success,
      true,
    )
    assert.equal(
      createAdminSchema.safeParse({
        email: 'editor@example.com',
        password: 'short',
        permissions: ['projects'],
      }).success,
      false,
    )
    assert.equal(
      createAdminSchema.safeParse({
        email: 'editor@example.com',
        password: 'a-unique-admin-password',
        permissions: [],
      }).success,
      false,
    )
  })
})

describe('site settings validation', () => {
  it('accepts optional contact number and Discord ID fields', () => {
    const settings = siteSettingsSchema.parse({
      contactNumber: ' +1 (555) 123-4567 ',
      discordId: 'azstudio#1234',
    })

    assert.equal(settings.contactNumber, '+1 (555) 123-4567')
    assert.equal(settings.discordId, 'azstudio#1234')
    assert.equal(siteSettingsSchema.safeParse({ contactNumber: 'x'.repeat(41) }).success, false)
    assert.equal(siteSettingsSchema.safeParse({ discordId: 'x'.repeat(101) }).success, false)
  })
})

describe('project validation', () => {
  it('defaults new project content to draft', () => {
    const project = projectSchema.parse({
      slug: 'studio-reel',
      title: 'Studio reel',
      category: 'Brand & promo',
      description: 'A short approved project description.',
    })

    assert.equal(project.status, 'draft')
  })

  it('rejects unsafe or malformed project slugs', () => {
    assert.throws(() =>
      projectSchema.parse({
        slug: '../private',
        title: 'Project',
        category: 'YouTube',
        description: 'Description',
      }),
    )
  })
})

describe('Cloudinary media policy', () => {
  it('rejects unsupported formats and oversized images', () => {
    assert.match(getMediaPolicyError('image', 'svg', 100) ?? '', /Unsupported/)
    assert.match(getMediaPolicyError('image', 'jpg', 16 * 1024 * 1024) ?? '', /size/)
  })

  it('accepts supported formats within the size limit', () => {
    assert.equal(getMediaPolicyError('video', 'mp4', 1024 * 1024), null)
  })
})

describe('inquiry validation', () => {
  it('validates admin-created inquiries and defaults their status', () => {
    const inquiry = adminInquirySchema.parse({
      name: 'Alex Example',
      email: 'alex@example.com',
      service: 'YouTube video editing',
      projectDescription: 'I need help editing a ten-minute video for my channel.',
    })

    assert.equal(inquiry.status, 'new')
    assert.equal(
      adminInquiryUpdateSchema.safeParse({
        status: 'in_progress',
        comment: 'Contacted the client.',
      }).success,
      true,
    )
    assert.equal(adminInquiryUpdateSchema.safeParse({}).success, false)
    assert.equal(adminInquiryUpdateSchema.safeParse({ status: 'invalid' }).success, false)
  })

  it('requires valid contact details, a project description, and consent', () => {
    assert.throws(() =>
      inquirySchema.parse({
        name: 'Alex Example',
        email: 'not-an-email',
        service: 'YouTube video editing',
        projectDescription: 'I need an editor for a project.',
        consent: true,
      }),
    )

    assert.throws(() =>
      inquirySchema.parse({
        name: 'Alex Example',
        email: 'alex@example.com',
        service: 'YouTube video editing',
        projectDescription: 'I need an editor for a project.',
        consent: false,
      }),
    )
  })

  describe('client showcase validation', () => {
    it('accepts video, a comment screenshot, and a social handle', () => {
      const client = clientSchema.parse({
        name: 'Example Creator',
        videoUrl: 'https://media.example.com/project.mp4',
        videoThumbnailUrl: 'https://media.example.com/thumbnail.jpg',
        commentScreenshotUrl: 'https://media.example.com/feedback.jpg',
        socialPlatform: 'Instagram',
        socialHandle: '@examplecreator',
        isPublished: true,
      })

      assert.equal(client.socialHandle, '@examplecreator')
      assert.equal(client.isPublished, true)
    })
  })

  describe('public client rating validation', () => {
    it('requires a name and social platform identity for a rating', () => {
      assert.deepEqual(
        publicRatingSchema.parse({
          rating: 5,
          name: ' Alex Example ',
          socialPlatform: ' YouTube ',
          socialHandle: ' @alexcreates ',
        }),
        {
          rating: 5,
          name: 'Alex Example',
          socialPlatform: 'YouTube',
          socialHandle: '@alexcreates',
        },
      )
      assert.equal(publicRatingSchema.safeParse({ rating: 5 }).success, false)
    })

    it('rejects ratings outside the five-star scale', () => {
      assert.equal(
        publicRatingSchema.safeParse({
          rating: 6,
          name: 'Alex Example',
          socialPlatform: 'YouTube',
          socialHandle: '@alexcreates',
        }).success,
        false,
      )
    })
  })

  it('accepts a valid inquiry with an empty honeypot field', () => {
    const inquiry = inquirySchema.parse({
      name: 'Alex Example',
      email: 'alex@example.com',
      service: 'YouTube video editing',
      projectDescription: 'I need help editing a ten-minute video for my channel.',
      consent: true,
      website: '',
    })

    assert.equal(inquiry.email, 'alex@example.com')
    assert.equal(inquiry.website, '')
  })

  it('accepts optional internal notes on status transitions and enforces the note limit', () => {
    assert.equal(
      inquiryStatusSchema.safeParse({
        status: 'in_progress',
        comment: 'Contacted the client and waiting for a response.',
      }).success,
      true,
    )
    assert.equal(
      inquiryStatusSchema.safeParse({
        status: 'closed',
        comment: 'x'.repeat(2001),
      }).success,
      false,
    )
  })
})
