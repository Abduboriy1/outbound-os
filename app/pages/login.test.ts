import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiCard from '~/components/ui/UiCard.vue'
import UiCardBody from '~/components/ui/UiCardBody.vue'
import UiField from '~/components/ui/UiField.vue'
import UiInput from '~/components/ui/UiInput.vue'
import LoginPage from '~/pages/login.vue'

/**
 * Nuxt auto-imports and the `definePageMeta` macro do not exist in a plain
 * vitest run (MIGRATION.md §7), so the handful the page touches are stubbed on
 * `globalThis`. `useSession` is the seam: the page never calls `$fetch`
 * directly, it goes through the composable, so the test asserts on that.
 */
const login = vi.fn()
const navigateTo = vi.fn()

vi.stubGlobal('ref', ref)
vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useSession', () => ({ login }))
vi.stubGlobal('navigateTo', navigateTo)

function mountPage() {
  return mount(LoginPage, {
    global: {
      plugins: [[PrimeVue, { theme: 'none' }]],
      components: { UiButton, UiCard, UiCardBody, UiField, UiInput },
      stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
    },
  })
}

async function fillAndSubmit(wrapper: ReturnType<typeof mountPage>) {
  await wrapper.find('input[name="email"]').setValue('demo@example.com')
  await wrapper.find('input[name="password"]').setValue('demo12345')
  await wrapper.find('form').trigger('submit')
}

describe('login page', () => {
  beforeEach(() => {
    login.mockReset()
    navigateTo.mockReset()
  })

  it('renders the source copy and both fields', () => {
    const wrapper = mountPage()

    expect(wrapper.get('h1').text()).toBe('AI Sales Engine')
    expect(wrapper.text()).toContain('Sign in to your workspace.')

    const email = wrapper.get('input[name="email"]')
    expect(email.attributes('type')).toBe('email')
    expect(email.attributes('autocomplete')).toBe('email')
    expect(email.attributes('required')).toBeDefined()

    const password = wrapper.get('input[name="password"]')
    expect(password.attributes('type')).toBe('password')
    expect(password.attributes('autocomplete')).toBe('current-password')

    expect(wrapper.get('button').text()).toBe('Sign in')
    expect(wrapper.get('a').attributes('href')).toBe('/register')
  })

  it('posts the credentials and redirects to the dashboard', async () => {
    login.mockResolvedValue({ id: 'u1' })
    const wrapper = mountPage()

    await fillAndSubmit(wrapper)
    await new Promise(resolve => setTimeout(resolve))

    expect(login).toHaveBeenCalledWith('demo@example.com', 'demo12345')
    expect(navigateTo).toHaveBeenCalledWith('/')
    expect(wrapper.find('.text-danger').exists()).toBe(false)
  })

  it('shows the endpoint message on bad credentials and stays put', async () => {
    login.mockRejectedValue({ data: { error: 'Incorrect email or password' } })
    const wrapper = mountPage()

    await fillAndSubmit(wrapper)
    await new Promise(resolve => setTimeout(resolve))
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.text-danger').text()).toBe('Incorrect email or password')
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('surfaces the 422 validation message from the endpoint', async () => {
    login.mockRejectedValue({ data: { error: 'Password must be at least 8 characters' } })
    const wrapper = mountPage()

    await fillAndSubmit(wrapper)
    await new Promise(resolve => setTimeout(resolve))
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.text-danger').text()).toBe('Password must be at least 8 characters')
  })

  it('falls back to a generic message when the failure carries no body', async () => {
    login.mockRejectedValue(new Error('network down'))
    const wrapper = mountPage()

    await fillAndSubmit(wrapper)
    await new Promise(resolve => setTimeout(resolve))
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.text-danger').text()).toBe('Something went wrong')
  })

  it('disables the button and swaps its label while in flight', async () => {
    let release: () => void = () => {}
    login.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))
    const wrapper = mountPage()

    await fillAndSubmit(wrapper)
    await wrapper.vm.$nextTick()

    const button = wrapper.get('button')
    expect(button.text()).toBe('Signing in…')
    expect(button.attributes('disabled')).toBeDefined()

    // A second submit while pending must not fire a second request.
    await wrapper.find('form').trigger('submit')
    expect(login).toHaveBeenCalledTimes(1)

    release()
    await new Promise(resolve => setTimeout(resolve))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('button').text()).toBe('Sign in')
  })
})
