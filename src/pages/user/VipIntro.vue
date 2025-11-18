<script setup lang="ts">
import BasePage from '@/components/BasePage.vue'
import BaseButton from '@/components/BaseButton.vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/auth.ts'
import { User } from "@/apis/user.ts";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import Header from "@/components/Header.vue";
import { couponInfo, LevelBenefits, levelBenefits, orderCreate, orderStatus } from "@/apis/member.ts";
import Radio from "@/components/base/radio/Radio.vue";
import RadioGroup from "@/components/base/radio/RadioGroup.vue";
import { APP_NAME } from "@/config/env.ts";
import Toast from "@/components/base/toast/Toast.ts";
import { _dateFormat, _nextTick } from "@/utils";
import InputNumber from "@/components/base/InputNumber.vue";
import dayjs from "dayjs";
import BaseInput from "@/components/base/BaseInput.vue";

const router = useRouter()
const userStore = useUserStore()

interface Plan {
  id: string
  name: string
  price: number
  unit: '月' | '年'
  highlight?: string
  autoRenew?: boolean
}

let loading = $ref(false);
let selectedPaymentMethod = $ref('wechat')
let selectedPlanId = $ref(undefined)
let duration = $ref(1)
const member = $computed<User['member']>(() => userStore.user?.member ?? {} as any)

const memberEndDate = $computed(() => {
  if (member?.endDate === null) return '永久'
  return member?.endDate
})

let data = $ref<LevelBenefits>({} as any)
const plans: Plan[] = $computed(() => {
  let list = []
  if (data?.level) {
    list.push({
      id: 'month',
      name: '月付',
      price: data.level.price,
      unit: '月',
    },)
    list.push({
      id: 'month_auto',
      name: '连续包月',
      price: data.level.price_auto,
      unit: '月',
      highlight: '性价比更高',
      autoRenew: true,
    },)
    list.push({
      id: 'year',
      name: '年度会员',
      price: data.level.yearly_price,
      unit: '年',
      highlight: '年度优惠',
    },)
  }
  return list
})

// Payment methods - WeChat and Alipay
const paymentMethods = [
  {
    id: 'wechat',
    name: '微信支付',
    description: '使用微信支付'
  },
  {
    id: 'alipay',
    name: '支付宝',
    description: '使用支付宝支付'
  }
]

const currentPlan = $computed(() => {
  return plans.find(v => v.id === member?.plan) ?? null
})

const selectPlan = $computed(() => {
  return plans.find(v => v.id === selectedPlanId) ?? null
})

const totalPrice = $computed(() => (Number(duration) * Number(selectPlan?.price)).toFixed(1))

const startDate = $computed(() => {
  if (member?.active) {
    return member.endDate
  } else {
    return _dateFormat(Date.now())
  }
})

onMounted(async () => {
  let res = await levelBenefits({levelCode: 'basic'})
  if (res.success) {
    data = res.data
  }
})

// Toggle auto-renewal
function toggleAutoRenew() {
  // TODO: Implement API call to toggle auto-renewal
  console.log('Toggle auto-renewal:', !member.autoRenew)
}

// Get button text based on current plan
function getPlanButtonText(plan: Plan) {
  if (plan.id === selectedPlanId) return '已选中'
  if (plan.id === currentPlan?.id) return '当前计划'
  return '选择'
}

function goPurchase(plan: Plan) {
  if (!userStore.isLogin) {
    router.push({path: '/login', query: {redirect: '/vip'}})
    return
  }
  selectedPlanId = plan.id
  _nextTick(() => {
    let el = document.getElementById('pay')
    el.scrollIntoView({behavior: "smooth"})
  })
}

let startLoop = $ref(false)
let orderNo = $ref('')
let timer: number = $ref()
let showCouponInput = $ref(false)
let couponCode = $ref('')
let discount = $ref(1)

watch(() => startLoop, (n) => {
  if (n) {
    clearInterval(timer)
    timer = setInterval(() => {
      orderStatus({orderNo}).then(res => {
        if (res?.success) {
          if (res.data?.payment_status === 'paid') {
            Toast.success('付款成功')
            userStore.init()
            startLoop = false
            selectedPlanId = undefined
          }
        } else {
          startLoop = false
          Toast.error(res.msg || '付款失败')
        }
      })
    }, 1000)
  } else {
    clearInterval(timer)
  }
})

onUnmounted(() => {
  startLoop = false
  clearInterval(timer)
})

async function handlePayment() {
  if (loading) return
  loading = true
  let data = {
    plan: selectedPlanId,
    duration: Number(duration),
    payment_method: selectedPaymentMethod
  }
  let res = await orderCreate(data)
  if (res.success) {
    orderNo = res.data.orderNo
    startLoop = true
  } else {
    Toast.error(res.msg || '付款失败')
  }
  loading = false
}

async function handleCoupon() {
  if (showCouponInput) {
    let res = await couponInfo({couponCode})
    if (res.success) {
      discount = res.data.discount
    } else {
      Toast.error(res.msg || '优惠券无效')
    }
  } else {
    showCouponInput = true
  }
}

</script>

<template>
  <BasePage>
    <div class="space-y-6">
      <div class="card bg-reverse-white">
        <Header title="会员介绍"></Header>
        <div class="grid grid-cols-3 grid-rows-3 gap-3">
          <div class="text-lg  items-center" v-for="f in data.benefits" :key="f.name">
            <IconFluentCheckmarkCircle20Regular class="mr-2 text-green-600"/>
            <span>
               <span>{{ f.name }}</span>
                <span v-if="f.value !== 'true'">{{ `(${f.value}${f.unit ?? ''})` }}</span>
              </span>
          </div>
        </div>
      </div>

      <div v-if="member?.active" class="card bg-green-50 border border-green-200 mt-3 mb-6 shadow-lg">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <IconFluentCheckmarkCircle20Regular class="mr-2 text-green-600"/>
            <div>
              <div class="font-semibold text-green-800">当前计划：{{ currentPlan?.name }}</div>
              <div class="text-sm text-green-600">
                到期时间：{{ memberEndDate }}
              </div>
            </div>
          </div>
          <div class="text-align-end space-y-2">
            <div v-if="member.autoRenew" class="flex items-center gap-space">
              <div class="flex items-center text-sm text-gray-600">
                <IconFluentArrowRepeatAll20Regular class="mr-1"/>
                <span>自动续费已开启</span>
              </div>
              <BaseButton
                  size="small"
                  type="info"
                  @click="toggleAutoRenew">
                关闭
              </BaseButton>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-between">
        <div class="title">选择适合您的套餐</div>
        <div class="subtitle">三种方案，按需选择</div>
      </div>

      <div class="plans">
        <div v-for="p in plans" :key="p.id"
             class="card bg-reverse-white shadow-lg p-0 shadow-lg overflow-hidden flex flex-col">
          <div class="plan-name">{{ p.name }}</div>
          <div class="p-6 flex flex-col justify-between flex-1">
            <div class="plan-head">
              <div class="price">
                <span class="amount">¥{{ p.price }}</span>
                <span class="unit">/ 每{{ p.unit }}</span>
              </div>
              <div v-if="p.highlight" class="tag">{{ p.highlight }}</div>
            </div>
            <div v-if="p.autoRenew" class="text-sm flex items-center mt-4">
              <IconFluentArrowRepeatAll20Regular class="mr-2"/>
              开启自动续费，可随时关闭
            </div>
            <BaseButton
                class="w-full mt-4"
                size="large"
                :type="(p.id === currentPlan?.id || p.id === selectedPlanId) ? 'primary' : 'info'"
                :disabled="p.id === currentPlan?.id"
                @click="goPurchase(p)">
              {{ getPlanButtonText(p) }}
            </BaseButton>
          </div>
        </div>
      </div>

    </div>

    <div id="pay" class="mb-50" v-if="selectedPlanId">
      <!-- Page Header -->
      <div class="text-center mb-6">
        <h1 class="text-xl font-semibold mb-2">安全支付</h1>
        <p class="">选择支付方式完成订单</p>
      </div>


      <div class="center">
        <div class="card bg-reverse-white gap-6 flex justify-between items-center w-7/10">
          <div class="center gap-2" v-if="!showCouponInput">
            <IconStreamlineDiscountPercentCoupon/>
            <span>有抵用券？</span>
          </div>
          <BaseInput v-else v-model="couponCode" placeholder="请输入优惠券" autofocus/>
          <BaseButton size="large" @click="handleCoupon">{{ showCouponInput ? '确定' : '在此兑换!' }}</BaseButton>
        </div>
      </div>

      <!-- Main Content -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Left Card: Payment Method Selection -->
        <div class="card bg-white shadow-lg">
          <div class="text-lg font-medium mb-4">选择支付方式</div>
          <RadioGroup v-model="selectedPaymentMethod">
            <div class="space-y-3 w-full">
              <div
                  v-for="method in paymentMethods"
                  :key="method.id"
                  @click=" selectedPaymentMethod = method.id"
                  class="flex p-4 border rounded-lg cp transition-all duration-200"
                  :class="[
                  selectedPaymentMethod === method.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                ]"
              >
                <div class="flex items-center flex-1 gap-2">
                  <IconSimpleIconsWechat class="text-xl"/>
                  <div>
                    <div class="font-medium">{{ method.name }}</div>
                    <div class="text-sm text-gray-500">{{ method.description }}</div>
                  </div>
                </div>
                <Radio :value="method.id" label=""></Radio>
              </div>
            </div>
          </RadioGroup>
        </div>

        <!-- Right Card: Order Summary -->
        <div class="card bg-white shadow-lg">
          <div class="text-lg font-semibold mb-4">订单概要</div>

          <!-- Plan Info -->
          <div class="mb-4">
            <div class="text-purple-600 text-sm mb-2">付费方案（{{ selectPlan?.name }}）订阅</div>
            <div class="text-gray-900 mb-4">
              从 {{ startDate }} 开始:
            </div>
          </div>

          <div class="flex justify-between items-center mb-4">
            <!-- Price -->
            <div class="flex items-baseline">
              <span class="font-semibold text-gray-900"
                    :class="selectPlan?.id === 'month_auto' ? 'text-3xl' : 'text-xl'">￥{{ selectPlan?.price }}</span>
              <span class="text-gray-600 ml-2">/ {{ selectPlan?.unit }}</span>
            </div>
            <div v-if="selectPlan?.id !== 'month_auto'">
              <InputNumber v-model="duration"/>
            </div>
          </div>


          <div class="flex justify-between items-center mb-4" v-if="selectPlan?.id !== 'month_auto' ">
            <!-- Price -->
            <div class="flex items-baseline">
              <span class="text-2xl font-semibold text-gray-900">总计：</span>
              <span class="text-3xl font-semibold text-gray-900">￥{{ totalPrice }}</span>
            </div>
          </div>

          <div class="bg-gray-200	 text-sm px-4 py-3 rounded-lg mb-4 color-black">
            会员属于虚拟服务，一经购买激活后不支持退款。请在购买前仔细阅读权益说明，确认符合您的需求再进行支付。
          </div>

          <!-- Payment Button -->
          <BaseButton
              class="w-full"
              size="large"
              :loading="loading || startLoop"
              :type="!!selectedPaymentMethod ? 'primary' : 'info'"
              :disabled="!selectedPaymentMethod"
              @click="handlePayment"
          >
            付款
          </BaseButton>
        </div>
      </div>
    </div>
  </BasePage>
</template>

<style scoped lang="scss">

.plans {
  display: grid;
  gap: 3rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.plan-head {
  @apply flex flex-col gap-2;
}

.plan-name {
  @apply text-2xl font-bold bg-gray-300 px-6 py-4;
}

.price {
  @apply flex items-end gap-1;
}

.amount {
  @apply text-4xl font-500;
}

.unit {
  @apply text-base text-gray-500;
}

.desc {
  @apply text-sm text-gray-600;
}

.tag {
  @apply text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded w-fit;
}
</style>

