import type { BusinessHour, CloudFunctionResponse, HomeData, ShopSettings, ShrimpPackage, TimeSlot } from './types/home'
import { callCloudFunction } from '@/cloud'

export const defaultHomeData: HomeData = {
  settings: {
    shopName: '钓虾乐园',
    address: '请在门店设置中填写地址',
    phone: '',
    businessHours: [
      {
        label: '今日营业',
        startTime: '10:00',
        endTime: '22:00',
      },
    ],
    coverImages: [],
    notice: '欢迎预约到店钓虾，营业信息以门店现场为准。',
    bookingMode: 'walk_in',
  },
  packages: [],
  timeSlots: [],
  serverTime: new Date().toISOString(),
}

export async function getHomeData() {
  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<HomeData>>('getHomeData')

  if (res.code !== 0) {
    throw new Error(res.message || '首页数据获取失败')
  }

  return normalizeHomeData(res.data)
  // #endif

  return normalizeHomeData(defaultHomeData)
}

function normalizeHomeData(data: HomeData): HomeData {
  return {
    settings: normalizeSettings(data.settings),
    packages: (data.packages || []).map(normalizePackage),
    timeSlots: (data.timeSlots || []).map(normalizeTimeSlot),
    serverTime: data.serverTime || new Date().toISOString(),
  }
}

function normalizeSettings(settings?: Partial<ShopSettings>): ShopSettings {
  return {
    ...defaultHomeData.settings,
    ...settings,
    businessHours: normalizeBusinessHours(settings?.businessHours),
    coverImages: Array.isArray(settings?.coverImages) ? settings.coverImages : [],
    notice: settings?.notice || defaultHomeData.settings.notice,
  }
}

function normalizeBusinessHours(hours?: BusinessHour[]) {
  if (!Array.isArray(hours)) {
    return defaultHomeData.settings.businessHours
  }

  return hours
    .filter(item => item?.startTime && item?.endTime)
    .map(item => ({
      label: item.label || '营业',
      startTime: item.startTime,
      endTime: item.endTime,
    }))
}

function normalizePackage(packageItem: Partial<ShrimpPackage>): ShrimpPackage {
  return {
    _id: packageItem._id || '',
    name: packageItem.name || '未命名套餐',
    description: packageItem.description || '',
    durationMinutes: packageItem.durationMinutes || 0,
    price: packageItem.price || 0,
    rodCount: packageItem.rodCount || 1,
    maxPeople: packageItem.maxPeople || packageItem.rodCount || 1,
    status: packageItem.status || 'active',
    sort: packageItem.sort || 0,
  }
}

function normalizeTimeSlot(slot: Partial<TimeSlot>): TimeSlot {
  return {
    _id: slot._id || '',
    date: slot.date || '',
    startTime: slot.startTime || '',
    endTime: slot.endTime || '',
    capacity: slot.capacity || 0,
    bookedCount: slot.bookedCount || 0,
    status: slot.status || 'available',
    remark: slot.remark || '',
  }
}
