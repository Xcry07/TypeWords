<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseInput from "@/components/base/BaseInput.vue";
import BaseButton from "@/components/BaseButton.vue";
import { APP_NAME } from "@/config/env.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { sendCode, register as registerApi, resetPassword, uploadImportData } from "@/apis";
import { validateLoginForm, validateRegisterForm, validateResetPasswordForm } from "@/utils/validation.ts";
import Toast from "@/components/base/toast/Toast.ts";
import { getWechatAuthUrl, PHONE_CONFIG } from "@/config/auth.ts";

// 状态管理
const authStore = useAuthStore()
const route = useRoute()

// 页面状态
let currentMode = $ref<'login' | 'register' | 'forgot'>('login')
let loginType = $ref<'code' | 'password'>('code') // 默认验证码登录
let isLoading = $ref(false)
let isSendingCode = $ref(false)
let codeCountdown = $ref(0)
let showWechatQR = $ref(true)
let wechatQRUrl = $ref('')
let qrExpired = $ref(false)
let qrScanned = $ref(true) // 二维码是否已扫描
let qrExpireTimer: ReturnType<typeof setTimeout> | null = null
let qrCheckInterval: ReturnType<typeof setInterval> | null = null
const QR_EXPIRE_TIME = 5 * 60 * 1000 // 5分钟过期

// 密码显示/隐藏状态
let showLoginPassword = $ref(false)
let showRegisterPassword = $ref(false)
let showRegisterConfirmPassword = $ref(false)
let showForgotPassword = $ref(false)
let showForgotConfirmPassword = $ref(false)

// 表单数据
const loginForm = $ref({
  account: '', // 支持邮箱或手机号
  password: ''
})

const phoneLoginForm = $ref({
  phone: '',
  code: ''
})

const registerForm = $ref({
  phone: '',
  password: '',
  confirmPassword: '',
  code: ''
})

const forgotForm = $ref({
  phone: '',
  code: '',
  newPassword: '',
  confirmPassword: ''
})

// 错误信息
const loginErrors = ref<Record<string, string>>({})
const registerErrors = ref<Record<string, string>>({})
const forgotErrors = ref<Record<string, string>>({})

// 发送验证码
async function sendVerificationCode(phone: string, type: 'login' | 'register' | 'reset_password') {
  if (!phone) {
    Toast.error('请输入手机号')
    return
  }

  if (!PHONE_CONFIG.phoneRegex.test(phone)) {
    Toast.error('请输入有效的手机号')
    return
  }

  try {
    isSendingCode = true
    const response = await sendCode({phone, type})

    if (response.success) {
      Toast.success('验证码已发送')
      codeCountdown = PHONE_CONFIG.sendInterval
      const timer = setInterval(() => {
        codeCountdown--
        if (codeCountdown <= 0) {
          clearInterval(timer)
        }
      }, 1000)
    } else {
      Toast.error(response.msg || '发送失败')
    }
  } catch (error) {
    console.error('Send code error:', error)
    Toast.error('发送验证码失败')
  } finally {
    isSendingCode = false
  }
}

// 账号密码登录
async function handleLogin() {
  // 判断是邮箱还是手机号
  const isEmail = loginForm.account.includes('@')
  const validation = validateLoginForm({
    email: isEmail ? loginForm.account : undefined,
    phone: !isEmail ? loginForm.account : undefined,
    password: loginForm.password,
    code: undefined,
    type: 'email'
  })

  if (!validation.isValid) {
    Object.assign(loginErrors, validation.errors)
    return
  }

  isLoading = true
  try {
    await authStore.login({
      email: isEmail ? loginForm.account : undefined,
      phone: !isEmail ? loginForm.account : undefined,
      password: loginForm.password,
      type: 'email'
    })
  } finally {
    isLoading = false
  }
}

// 手机号验证码登录
async function handlePhoneCodeLogin() {
  const validation = validateLoginForm({
    phone: phoneLoginForm.phone,
    code: phoneLoginForm.code,
    password: undefined,
    type: 'phone'
  })

  if (!validation.isValid) {
    Object.assign(loginErrors, validation.errors)
    return
  }

  isLoading = true
  try {
    await authStore.login({
      phone: phoneLoginForm.phone,
      code: phoneLoginForm.code,
      type: 'phone'
    })
  } finally {
    isLoading = false
  }
}

// 注册
async function handleRegister() {
  if (registerForm.password !== registerForm.confirmPassword) {
    Toast.error('两次密码输入不一致')
    return
  }

  const validation = validateRegisterForm({
    phone: registerForm.phone,
    password: registerForm.password,
    code: registerForm.code,
    nickname: undefined,
    email: undefined
  })

  if (!validation.isValid) {
    Object.assign(registerErrors, validation.errors)
    return
  }

  isLoading = true
  try {
    await authStore.register({
      phone: registerForm.phone,
      password: registerForm.password,
      code: registerForm.code,
      nickname: undefined,
      email: undefined
    })
  } finally {
    isLoading = false
  }
}

// 忘记密码
async function handleForgotPassword() {
  if (forgotForm.newPassword !== forgotForm.confirmPassword) {
    Toast.error('两次密码输入不一致')
    return
  }

  const validation = validateResetPasswordForm({
    phone: forgotForm.phone,
    email: undefined,
    code: forgotForm.code,
    newPassword: forgotForm.newPassword
  })

  if (!validation.isValid) {
    Object.assign(forgotErrors, validation.errors)
    return
  }

  isLoading = true
  try {
    const response = await authStore.resetPassword({
      phone: forgotForm.phone,
      email: undefined,
      code: forgotForm.code,
      newPassword: forgotForm.newPassword
    })

    if (response.success) {
      Toast.success('密码重置成功，请重新登录')
      switchMode('login')
    } else {
      Toast.error(response.msg || '重置失败')
    }
  } finally {
    isLoading = false
  }
}

// 清除二维码相关定时器
function clearQRTimers() {
  if (qrExpireTimer) {
    clearTimeout(qrExpireTimer)
    qrExpireTimer = null
  }
  if (qrCheckInterval) {
    clearInterval(qrCheckInterval)
    qrCheckInterval = null
  }
}

// 刷新二维码
async function refreshQRCode() {
  clearQRTimers()
  qrExpired = false
  qrScanned = false
  await handleWechatLogin()
}

// 微信登录 - 显示二维码
async function handleWechatLogin() {
  try {
    showWechatQR = true
    qrExpired = false
    qrScanned = false

    // 这里应该调用后端获取二维码
    // const response = await getWechatQR()
    // wechatQRUrl = response.qrUrl

    // 暂时使用占位二维码
    wechatQRUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPgogIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OTk5OSI+55So5o6l566h55CG6L295Lit6K+B77yBPC90ZXh0Pgo8L3N2Zz4K'

    // 模拟轮询检查扫码状态
    qrCheckInterval = setInterval(async () => {
      // 这里应该轮询后端检查扫码状态
      // const result = await checkWechatLoginStatus()
      // if (result.scanned) {
      //   qrScanned = true // 设置扫描成功状态
      // }
      // if (result.success) {
      //   clearQRTimers()
      //   showWechatQR = false
      //   qrScanned = false
      //   // 登录成功处理
      // }
    }, 2000)

    // 设置二维码过期
    qrExpireTimer = setTimeout(() => {
      qrExpired = true
      qrScanned = false
      clearInterval(qrCheckInterval!)
      qrCheckInterval = null
      Toast.info('二维码已过期，请点击刷新')
    }, QR_EXPIRE_TIME)

  } catch (error) {
    console.error('Wechat login error:', error)
    Toast.error('微信登录失败')
  }
}

// 切换模式
function switchMode(mode: 'login' | 'register' | 'forgot') {
  currentMode = mode
  clearErrors()
  // 切换到注册或忘记密码模式时，隐藏微信扫码
  if (mode === 'register' || mode === 'forgot') {
    if (showWechatQR) {
      clearQRTimers()
      showWechatQR = false
      qrExpired = false
    }
  }
}

// 清除错误
function clearErrors() {
  loginErrors.value = {}
  registerErrors.value = {}
  forgotErrors.value = {}
}

async function handleAudioChange(e) {
  let uploadFile = e.target?.files?.[0]
  if (!uploadFile) return
  let data = new FormData();
  data.append("file", uploadFile);
  let res = await uploadImportData(data, e => {
    console.log('e', e)
  })
  console.log('res', res)
  console.log(uploadFile)
  e.target.value = ''
}

async function s() {
  const taskId = await fetch('/startImport').then(r => r.json()).then(d => d.taskId);

  const timer = setInterval(async () => {
    const res = await fetch(`/getProgress/${taskId}`).then(r => r.json());
    console.log(`当前进度: ${res.progress}%`);
    if (res.progress >= 100) clearInterval(timer);
  }, 1000);
}

// 初始化页面
onMounted(() => {
  // 检查是否有重定向地址
  const redirect = route.query.redirect as string
  if (redirect) {
    // 如果有重定向地址，可以显示提示信息
    Toast.info('请先登录后再访问该页面')
  }
})

// 组件卸载时清理定时器
onBeforeUnmount(() => {
  clearQRTimers()
})
</script>

<template>
  <div class="center min-h-screen">
    <div class="rounded-2xl p-6 bg-white shadow-lg">
      <!-- 登录区域容器 - 弹框形式 -->
      <div class="flex gap-8">
        <!-- 左侧登录区域 -->
        <div class="flex-1 w-80">
          <h1 class="mb-6 text-center text-2xl font-semibold">{{ APP_NAME }}</h1>

          <!-- 登录选项 -->
          <div v-if="currentMode === 'login'">
            <!-- Tab切换 -->
            <div class="flex mb-6 border-b border-gray-200">
              <div
                  class="flex-1 py-3 text-center cursor-pointer transition-colors relative"
                  :class="loginType === 'code' ? 'text-blue-600 font-medium' : 'text-gray-600'"
                  @click="loginType = 'code'"
              >
                验证码登录
                <div
                    v-if="loginType === 'code'"
                    class="absolute bottom-0 left-1/2 transform -translate-x-1/2 h-0.5 bg-blue-600"
                    style="width: 4rem;"
                ></div>
              </div>
              <div
                  class="flex-1 py-3 text-center cursor-pointer transition-colors relative"
                  :class="loginType === 'password' ? 'text-blue-600 font-medium' : 'text-gray-600'"
                  @click="loginType = 'password'"
              >
                密码登录
                <div
                    v-if="loginType === 'password'"
                    class="absolute bottom-0 left-1/2 transform -translate-x-1/2 h-0.5 bg-blue-600"
                    style="width: 4rem;"
                ></div>
              </div>
            </div>

            <!-- 验证码登录表单 -->
            <template v-if="loginType === 'code'">
              <div class="mb-4">
                <BaseInput
                    v-model="phoneLoginForm.phone"
                    type="tel"
                    size="large"
                    placeholder="请输入手机号"
                    :class="{ 'has-error': loginErrors.phone }"
                />
                <div v-if="loginErrors.phone" class="mt-1 text-sm text-red-500 pl-2">{{ loginErrors.phone }}</div>
              </div>

              <div class="mb-4 flex gap-2">
                <div class="flex-1">
                  <BaseInput
                      v-model="phoneLoginForm.code"
                      type="text"
                      size="large"
                      placeholder="请输入验证码"
                      :class="{ 'has-error': loginErrors.code }"
                  />
                  <div v-if="loginErrors.code" class="mt-1 text-sm text-red-500 pl-2">{{ loginErrors.code }}</div>
                </div>
                <BaseButton
                    @click="sendVerificationCode(phoneLoginForm.phone, 'login')"
                    :disabled="isSendingCode || codeCountdown > 0"
                    type="info"
                    size="large"
                    class="whitespace-nowrap flex-shrink-0 min-w-[100px]"
                >
                  {{ codeCountdown > 0 ? `${codeCountdown}s` : (isSendingCode ? '发送中' : '获取验证码') }}
                </BaseButton>
              </div>

            </template>

            <!-- 密码登录表单 -->
            <template v-else>
              <div class="mb-4">
                <BaseInput
                    v-model="loginForm.account"
                    type="text"
                    size="large"
                    placeholder="请输入邮箱或手机号"
                    :class="{ 'has-error': loginErrors.email || loginErrors.phone }"
                />
                <div v-if="loginErrors.email" class="mt-1 text-sm text-red-500 pl-2">{{ loginErrors.email }}</div>
                <div v-if="loginErrors.phone" class="mt-1 text-sm text-red-500 pl-2">{{ loginErrors.phone }}</div>
              </div>
              <div class="mb-4 relative">
                <BaseInput
                    v-model="loginForm.password"
                    :type="showLoginPassword ? 'text' : 'password'"
                    size="large"
                    placeholder="请输入密码"
                    :class="{ 'has-error': loginErrors.password }"
                />
                <div
                    class="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-500 hover:text-gray-700 z-10"
                    @click="showLoginPassword = !showLoginPassword"
                >
                  <IconFluentEye16Regular v-if="!showLoginPassword"/>
                  <IconFluentEyeOff16Regular v-else/>
                </div>
                <div v-if="loginErrors.password" class="mt-1 text-sm text-red-500 pl-2">{{ loginErrors.password }}</div>
              </div>
            </template>

            <div class="mb-4 text-xs text-gray-500 text-center leading-relaxed">
              继续操作即表示你同意我们的
              <router-link to="/user-agreement" class="text-blue-600 hover:opacity-80">用户协议</router-link>
              与
              <router-link to="/privacy-policy" class="text-blue-600 hover:opacity-80">隐私政策</router-link>
            </div>

            <BaseButton
                class="w-full"
                size="large"
                :loading="isLoading"
                @click="handlePhoneCodeLogin"
            >
              登录
            </BaseButton>

            <!-- 底部操作链接 - 只在密码登录时显示 -->
            <div class="mt-4 flex justify-between text-sm" v-opacity="loginType !== 'code'">
              <div class="text-blue-600 cursor-pointer hover:opacity-80" @click="switchMode('register')">注册账号</div>
              <div class="text-blue-600 cursor-pointer hover:opacity-80" @click="switchMode('forgot')">忘记密码?</div>
            </div>
          </div>

          <!-- 注册模式 -->
          <div v-else-if="currentMode === 'register'">
            <h2 class="mb-6 text-xl font-semibold text-center">注册新账号</h2>

            <div class="mb-4">
              <BaseInput
                  v-model="registerForm.phone"
                  type="tel"
                  size="large"
                  placeholder="请输入手机号"
                  :class="{ 'has-error': registerErrors.phone }"
              />
              <div v-if="registerErrors.phone" class="mt-1 text-sm text-red-500 pl-2">{{ registerErrors.phone }}</div>
            </div>

            <div class="mb-4 flex gap-2">
              <div class="flex-1">
                <BaseInput
                    v-model="registerForm.code"
                    type="text"
                    size="large"
                    placeholder="请输入验证码"
                    :class="{ 'has-error': registerErrors.code }"
                />
                <div v-if="registerErrors.code" class="mt-1 text-sm text-red-500 pl-2">{{ registerErrors.code }}</div>
              </div>
              <BaseButton
                  @click="sendVerificationCode(registerForm.phone, 'register')"
                  :disabled="isSendingCode || codeCountdown > 0"
                  type="info"
                  size="large"
                  class="whitespace-nowrap flex-shrink-0 min-w-[100px]"
              >
                {{ codeCountdown > 0 ? `${codeCountdown}s` : (isSendingCode ? '发送中' : '获取验证码') }}
              </BaseButton>
            </div>

            <div class="mb-4 relative">
              <BaseInput
                  v-model="registerForm.password"
                  :type="showRegisterPassword ? 'text' : 'password'"
                  size="large"
                  placeholder="请设置密码（6-20位）"
                  :class="{ 'has-error': registerErrors.password }"
              />
              <div
                  class="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-500 hover:text-gray-700 z-10"
                  @click="showRegisterPassword = !showRegisterPassword"
              >
                <IconFluentEye16Regular v-if="!showRegisterPassword"/>
                <IconFluentEyeOff16Regular v-else/>
              </div>
              <div v-if="registerErrors.password" class="mt-1 text-sm text-red-500 pl-2">{{
                  registerErrors.password
                }}
              </div>
            </div>

            <div class="mb-4 relative">
              <BaseInput
                  v-model="registerForm.confirmPassword"
                  :type="showRegisterConfirmPassword ? 'text' : 'password'"
                  size="large"
                  placeholder="请再次输入密码"
              />
              <div
                  class="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-500 hover:text-gray-700 z-10"
                  @click="showRegisterConfirmPassword = !showRegisterConfirmPassword"
              >
                <IconFluentEye16Regular v-if="!showRegisterConfirmPassword"/>
                <IconFluentEyeOff16Regular v-else/>
              </div>
            </div>

            <div class="mb-4 text-xs text-gray-500 text-center leading-relaxed">
              继续操作即表示你同意我们的
              <router-link to="/user-agreement" class="text-blue-600 hover:opacity-80">用户协议</router-link>
              并确认已了解
              <router-link to="/privacy-policy" class="text-blue-600 hover:opacity-80">隐私政策</router-link>
              。
            </div>

            <BaseButton
                class="w-full"
                size="large"
                :loading="isLoading"
                @click="handleRegister"
            >
              注册
            </BaseButton>

            <div class="mt-4 text-center">
              <div class="text-blue-600 cursor-pointer hover:opacity-80 text-sm" @click="switchMode('login')">返回登录
              </div>
            </div>
          </div>

          <!-- 忘记密码模式 -->
          <div v-else-if="currentMode === 'forgot'">
            <h2 class="mb-6 text-xl font-semibold text-center">重置密码</h2>

            <div class="mb-4">
              <BaseInput
                  v-model="forgotForm.phone"
                  type="tel"
                  size="large"
                  placeholder="请输入手机号"
                  :class="{ 'has-error': forgotErrors.phone }"
              />
              <div v-if="forgotErrors.phone" class="mt-1 text-sm text-red-500 pl-2">{{ forgotErrors.phone }}</div>
            </div>

            <div class="mb-4 flex gap-2">
              <div class="flex-1">
                <BaseInput
                    v-model="forgotForm.code"
                    type="text"
                    size="large"
                    placeholder="请输入验证码"
                    :class="{ 'has-error': forgotErrors.code }"
                />
                <div v-if="forgotErrors.code" class="mt-1 text-sm text-red-500 pl-2">{{ forgotErrors.code }}</div>
              </div>
              <BaseButton
                  @click="sendVerificationCode(forgotForm.phone, 'reset_password')"
                  :disabled="isSendingCode || codeCountdown > 0"
                  type="info"
                  size="large"
                  class="whitespace-nowrap flex-shrink-0 min-w-[100px]"
              >
                {{ codeCountdown > 0 ? `${codeCountdown}s` : (isSendingCode ? '发送中' : '获取验证码') }}
              </BaseButton>
            </div>

            <div class="mb-4 relative">
              <BaseInput
                  v-model="forgotForm.newPassword"
                  :type="showForgotPassword ? 'text' : 'password'"
                  size="large"
                  placeholder="请输入新密码（6-20位）"
                  :class="{ 'has-error': forgotErrors.newPassword }"
              />
              <div
                  class="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-500 hover:text-gray-700 z-10"
                  @click="showForgotPassword = !showForgotPassword"
              >
                <IconFluentEye16Regular v-if="!showForgotPassword"/>
                <IconFluentEyeOff16Regular v-else/>
              </div>
              <div v-if="forgotErrors.newPassword" class="mt-1 text-sm text-red-500 pl-2">{{
                  forgotErrors.newPassword
                }}
              </div>
            </div>

            <div class="mb-4 relative">
              <BaseInput
                  v-model="forgotForm.confirmPassword"
                  :type="showForgotConfirmPassword ? 'text' : 'password'"
                  size="large"
                  placeholder="请再次输入新密码"
              />
              <div
                  class="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-500 hover:text-gray-700 z-10"
                  @click="showForgotConfirmPassword = !showForgotConfirmPassword"
              >
                <IconFluentEye16Regular v-if="!showForgotConfirmPassword"/>
                <IconFluentEyeOff16Regular v-else/>
              </div>
            </div>

            <div class="mb-4 text-xs text-gray-500 text-center leading-relaxed">
              继续操作即表示你同意我们的
              <router-link to="/user-agreement" class="text-blue-600 hover:opacity-80">用户协议</router-link>
              并确认已了解
              <router-link to="/privacy-policy" class="text-blue-600 hover:opacity-80">隐私政策</router-link>
              。
            </div>

            <BaseButton
                class="w-full"
                size="large"
                :loading="isLoading"
                @click="handleForgotPassword"
            >
              重置密码
            </BaseButton>

            <div class="mt-4 text-center">
              <div class="text-blue-600 cursor-pointer hover:opacity-80 text-sm" @click="switchMode('login')">返回登录
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧微信二维码 - 只在登录模式时显示 -->
         <div v-if="currentMode === 'login'" class="center flex-col bg-gray-100 rounded-xl p-8 shadow-lg">
           <div class="flex flex-col items-center">
             <div class="relative inline-block">
               <img
                   v-if="showWechatQR"
                   :src="wechatQRUrl"
                   alt="微信登录二维码"
                   class="w-[200px] h-[200px] border border-gray-300 rounded-lg bg-white block transition-opacity"
                   :class="{ 'opacity-50': qrExpired }"
               />
               <img
                   v-else
                   src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPgogIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OTk5OSI+55So5o6l566h55CG6L295Lit6K+B77yBPC90ZXh0Pgo8L3N2Zz4K"
                   alt="微信登录二维码"
                   class="w-[200px] h-[200px] border border-gray-300 rounded-lg bg-white block"
               />
               <!-- 扫描成功蒙层 -->
               <div
                   v-if="showWechatQR && qrScanned && !qrExpired"
                   class="absolute top-0 left-0 right-0 bottom-0 bg-white bg-opacity-95 rounded-lg flex items-center justify-center backdrop-blur-sm z-10"
               >
                 <div class="text-center px-4">
                   <p class="text-base text-gray-700 mb-2 font-medium">扫描成功</p>
                   <p class="text-sm text-gray-600">在微信中轻触允许即可登录</p>
                 </div>
               </div>
               <!-- 过期蒙层 -->
               <div
                   v-if="showWechatQR && qrExpired"
                   class="absolute top-0 left-0 right-0 bottom-0 bg-white bg-opacity-95 rounded-lg flex items-center justify-center backdrop-blur-sm z-10"
               >
                 <div class="text-center">
                   <p class="text-base text-gray-600 mb-4 font-medium">二维码已过期</p>
                   <BaseButton
                       @click="refreshQRCode"
                       type="primary"
                       size="large"
                       class="flex items-center justify-center"
                   >
                     <IconFluentReplay20Regular class="mr-2"/>
                     刷新二维码
                   </BaseButton>
                 </div>
               </div>
             </div>
             <p class="mt-4 text-sm text-gray-600">微信扫码登录</p>
           </div>
         </div>
      </div>
    </div>
  </div>
</template>
<style scoped lang="scss">
// Input错误状态覆盖
:deep(.base-input2.has-error) {
  border-color: #f56c6c;
}
</style>
