/**
 * Whether the desktop sidebar is collapsed off to the side.
 *
 * `useState` rather than a module-level `ref` so the value is per-request on the
 * server, and the restore from `localStorage` runs in `onMounted` rather than in
 * the composable body: reading storage during setup would make the server render
 * (always expanded) and the first client render disagree, which Vue reports as a
 * hydration mismatch.
 */
const STORAGE_KEY = 'ase.nav.collapsed'

export function useNavCollapsed() {
  const collapsed = useState('nav-collapsed', () => false)
  const restored = useState('nav-collapsed-restored', () => false)

  onMounted(() => {
    if (restored.value) return
    restored.value = true
    collapsed.value = window.localStorage.getItem(STORAGE_KEY) === '1'
  })

  function toggle() {
    collapsed.value = !collapsed.value
    window.localStorage.setItem(STORAGE_KEY, collapsed.value ? '1' : '0')
  }

  return { collapsed, toggle }
}
