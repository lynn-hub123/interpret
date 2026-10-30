<template>
  <div class="app-shell">
    <router-view />
    <TabBar />
    <OnboardingOverlay v-if="onboarding" @done="finishOnboarding" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import TabBar from './components/TabBar.vue'
import OnboardingOverlay from './components/OnboardingOverlay.vue'
import { needsOnboarding, completeOnboarding } from './lib/onboarding.js'

// 首次进入整个应用就播一遍铃的引导，不要求玩家先点进「题库」
const onboarding = ref(needsOnboarding())

function finishOnboarding() {
  completeOnboarding()
  onboarding.value = false
}
</script>
