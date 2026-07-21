import { Template } from 'e2b'

/**
 * Custom E2B template based on the same default base image that
 * Sandbox.create() uses when no template is specified (e2bdev/base).
 *
 * Build with: npm run build:sandbox
 */
export const template = Template().fromBaseImage()
