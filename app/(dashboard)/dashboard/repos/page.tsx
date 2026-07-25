import { redirect } from 'next/navigation'

/** Repos UI lives on the unified Settings page now. */
export default function ReposPage() {
  redirect('/dashboard/settings#repos')
}
