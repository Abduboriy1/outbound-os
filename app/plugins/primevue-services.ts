import ConfirmationService from "primevue/confirmationservice";
import ToastService from "primevue/toastservice";

/**
 * PrimeVue's imperative services are Vue plugins, not components, so the Nuxt
 * module does not install them. Registering them here is what makes
 * `useToast()` and `useConfirm()` work in any page or component.
 *
 * **This plugin is deliberately universal, not `.client`.** `useToast()` is an
 * `inject()` call: it must resolve in `setup()`, which runs on the server too.
 * While this was a `.client` plugin the injection key was absent during SSR and
 * `useToast()` threw `No PrimeVue Toast provided!`, taking the whole server
 * render down — so pages had to route around it with a no-op shim. Both
 * services are pure event-bus wiring with no DOM access (they only
 * `app.provide()` an object that emits on a bus), so installing them on the
 * server is safe.
 *
 * Note that *raising* a toast is still a client-side act: `<Toast />` only
 * subscribes to the bus once it has mounted in the browser, so a `toast.add()`
 * during SSR emits into a bus nobody is listening to. That is fine — toasts are
 * raised from event handlers. What matters is that `useToast()` resolves on
 * both sides instead of throwing.
 *
 * `<Toast />` is already mounted once in `app.vue`; add `<ConfirmDialog />` to a
 * page that calls `useConfirm()`.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(ToastService);
  nuxtApp.vueApp.use(ConfirmationService);
});
