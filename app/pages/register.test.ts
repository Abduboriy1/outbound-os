import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiCard from '~/components/ui/UiCard.vue'
import UiCardBody from '~/components/ui/UiCardBody.vue'
import UiField from '~/components/ui/UiField.vue'
import UiInput from '~/components/ui/UiInput.vue'
import RegisterPage from '~/pages/register.vue'

const register = vi.fn()
const navigateTo = vi.fn()

vi.stubGlobal('ref', ref)
vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useSession', () => ({ register }))
vi.stubGlobal('navigateTo', navigateTo)

function mountPage() {
  return mount(RegisterPage, {
    global: {
      plugins: [[PrimeVue, { theme: 'none' }]],
      components: { UiButton, UiCard, UiCardBody, UiField, UiInput },
      stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
    },
  })
}

async function fillAndSubmit(wrapper: ReturnType<typeof mountPage>) {
  await wrapper.find('input[name="name"]').setValue('Demo Operator')
  await wrapper.find('input[name="email"]').setValue('demo@example.com')
  await wrapper.find('input[name="password"]').setValue('demo12345')
  await wrapper.find('form').trigger('submit')
}

describe('register page', () => {
  beforeEach(() => {
    register.mockReset()
    navigateTo.mockReset()
  })

  it('renders the source copy, all three fields and the password hint', () => {
    const wrapper = mountPage()

    expect(wrapper.get('h1').text()).toBe('Create your workspace')
    expect(wrapper.text()).toContain(
      'This app is single-tenant by design — one workspace per operator.',
    )
    expect(wrapper.text()).toContain('At least 8 characters.')

    expect(wrapper.find('input[name="name"]').attributes('required')).toBeDefined()
    expect(wrapper.get('input[name="email"]').attributes('type')).toBe('email')
    expect(wrapper.get('input[name="password"]').attributes('autocomplete')).toBe(
      'new-password',
    )

    expect(wrapper.get('button').text()).toBe('Create account')
    expect(wrapper.get('a').attributes('href')).toBe('/login')
  })

  it('posts every field and redirects to the dashboard', async () => {
    register.mockResolvedValue({ id: 'u1' })
    const wrapper = mountPage()

    await fillAndSubmit(wrapper)
    await new Promise(resolve => setTimeout(resolve))

    expect(register).toHaveBeenCalledWith({
      name: 'Demo Operator',
      email: 'demo@example.com',
      password: 'demo12345',
    })
    expect(navigateTo).toHaveBeenCalledWith('/')
  })

  it('shows the 409 conflict message from the endpoint', async () => {
    register.mockRejectedValue({
      data: { error: 'An account with that email already exists' },
    })
    const wrapper = mountPage()

    await fillAndSubmit(wrapper)
    await new Promise(resolve => setTimeout(resolve))
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.text-danger').text()).toBe(
      'An account with that email already exists',
    )
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('shows the 422 validation message from the endpoint', async () => {
    register.mockRejectedValue({ data: { error: 'Name is required' } })
    const wrapper = mountPage()

    await fillAndSubmit(wrapper)
    await new Promise(resolve => setTimeout(resolve))
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.text-danger').text()).toBe('Name is required')
  })

  it('falls back to a generic message when the failure carries no body', async () => {
    register.mockRejectedValue(new Error('network down'))
    const wrapper = mountPage()

    await fillAndSubmit(wrapper)
    await new Promise(resolve => setTimeout(resolve))
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.text-danger').text()).toBe('Something went wrong')
  })

  it('disables the button and swaps its label while in flight', async () => {
    let release: () => void = () => {}
    register.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))
    const wrapper = mountPage()

    await fillAndSubmit(wrapper)
    await wrapper.vm.$nextTick()

    expect(wrapper.get('button').text()).toBe('Creating…')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()

    await wrapper.find('form').trigger('submit')
    expect(register).toHaveBeenCalledTimes(1)

    release()
    await new Promise(resolve => setTimeout(resolve))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('button').text()).toBe('Create account')
  })
})
