<script setup lang="ts">
/**
 * Port of `src/app/(app)/outreach/templates/page.tsx`.
 *
 * Templates and the objection library (plan §15, §21). Read-only reference:
 * the agent writes the actual messages, and these are the shapes it is steered
 * toward and the standard a human edits against.
 *
 * The Next page imported the data straight from `src/lib`. A Vue page cannot
 * import `~~/server/lib/**` at runtime (MIGRATION.md §1), so the templates,
 * the offer and the objection library live in `shared/` and both sides read
 * the same copy.
 */
import { OBJECTIONS } from "~~/shared/outreach/objections";
import { OUTREACH_TEMPLATES, findPlaceholders } from "~~/shared/outreach/templates";
import { DEFAULT_OFFER } from "~~/shared/outreach/offer";
import { VARIANT_LABELS } from "~/components/outreach/constants";
import type { OutreachVariant } from "~/components/outreach/constants";
</script>

<template>
  <div class="space-y-5">
    <UiPageHeader
      title="Templates and objections"
      description="The message shapes the outreach agent is steered toward, and the objection knowledge the reply agent uses. Placeholders are never sent: the approval queue refuses a message that still contains one."
    />

    <UiCard>
      <UiCardHeader
        title="The offer"
        description="What every message is ultimately about."
      />
      <UiCardBody class="space-y-2 text-sm">
        <p>{{ DEFAULT_OFFER.summary }}</p>
        <p class="text-muted">
          <span class="font-medium text-foreground">Entry point: </span>
          {{ DEFAULT_OFFER.entryPoint }}
        </p>
        <ul class="list-disc pl-5 text-xs text-muted">
          <li v-for="constraint in DEFAULT_OFFER.constraints" :key="constraint">
            {{ constraint }}
          </li>
        </ul>
      </UiCardBody>
    </UiCard>

    <section class="space-y-3">
      <h2 class="text-sm font-semibold">Message templates</h2>
      <UiCard v-for="template in OUTREACH_TEMPLATES" :key="template.key">
        <UiCardHeader :description="template.useWhen">
          <template #title>
            <span class="flex items-center gap-2">
              {{ template.name }}
              <UiBadge tone="accent">
                {{ VARIANT_LABELS[template.variant as OutreachVariant] }}
              </UiBadge>
            </span>
          </template>
        </UiCardHeader>
        <UiCardBody class="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div>
            <p v-if="template.subject" class="mb-1 text-xs">
              <span class="text-muted">Subject: </span>{{ template.subject }}
            </p>
            <p v-else class="mb-1 text-xs text-muted">No subject line.</p>
            <pre
              class="rounded-md border border-border bg-surface-muted p-3 text-xs whitespace-pre-wrap"
              >{{ template.body }}</pre
            >
            <p class="mt-1 text-xs text-muted">
              Placeholders: {{ findPlaceholders(template.body).join(", ") }}
            </p>
          </div>
          <div>
            <p class="text-xs font-medium text-muted">
              Why it is written this way
            </p>
            <ul class="mt-1 list-disc space-y-1 pl-4 text-xs text-muted">
              <li v-for="note in template.notes" :key="note">{{ note }}</li>
            </ul>
          </div>
        </UiCardBody>
      </UiCard>
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-semibold">Objection library</h2>
      <p class="text-xs text-muted">
        The objective is to understand the objection and work out whether the
        project genuinely makes sense — not to overcome resistance. Each entry
        names the case where the objection is simply correct.
      </p>
      <UiCard v-for="objection in OBJECTIONS" :key="objection.key">
        <UiCardHeader :title="objection.label" />
        <UiCardBody class="grid gap-4 text-xs md:grid-cols-3">
          <div>
            <p class="font-medium">Usually means</p>
            <ul class="mt-1 list-disc space-y-0.5 pl-4 text-muted">
              <li v-for="meaning in objection.likelyMeanings" :key="meaning">
                {{ meaning }}
              </li>
            </ul>
            <p class="mt-2 font-medium">Ask first</p>
            <ul class="mt-1 list-disc space-y-0.5 pl-4 text-muted">
              <li v-for="question in objection.understandFirst" :key="question">
                {{ question }}
              </li>
            </ul>
          </div>
          <div>
            <p class="font-medium">How to respond</p>
            <p class="mt-1 text-muted">{{ objection.guidance }}</p>
          </div>
          <div>
            <p class="font-medium text-danger">Never</p>
            <ul class="mt-1 list-disc space-y-0.5 pl-4 text-muted">
              <li v-for="item in objection.avoid" :key="item">{{ item }}</li>
            </ul>
            <p class="mt-2 font-medium text-positive">
              When the objection is right
            </p>
            <p class="mt-1 text-muted">{{ objection.legitimateWhen }}</p>
          </div>
        </UiCardBody>
      </UiCard>
    </section>
  </div>
</template>
