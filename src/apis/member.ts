import http from '@/utils/http.ts'

export type LevelBenefits = {
  "level": {
    "id": number,
    "name": string,
    "code": string,
    "level": number,
    "price": string,
    "price_auto": string,
    "yearly_price": string,
    "description": string,
    "color": string,
    "icon": string,
    "is_active": number,
    "created_at": string,
    "updated_at": string
  },
  "benefits": {
    "code": string,
    "name": string,
    "type": boolean,
    "unit": null,
    "value": string
  }[]
}

export function levelBenefits(params) {
  return http<LevelBenefits>('member/levelBenefits', null, params, 'get')
}

export function orderCreate(params) {
  return http<{orderNo:string}>('/member/orderCreate', params, null, 'post')
}

export function orderStatus(params) {
  return http('/member/orderStatus', null, params, 'get')
}

export function couponInfo(params) {
  return http('/member/couponInfo', null, params, 'get')
}
