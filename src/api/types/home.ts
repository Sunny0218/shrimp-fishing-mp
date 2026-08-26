export type PackageStatus = 'active' | 'disabled' | 'deleted'
export type TimeSlotStatus = 'available' | 'full' | 'closed'
export type BookingMode = 'walk_in' | 'slot'

export interface BusinessHour {
  label: string
  startTime: string
  endTime: string
}

export interface ShopLocation {
  latitude: number
  longitude: number
  address: string
}

export interface ShopSettings {
  _id?: string
  shopName: string
  address: string
  phone: string
  businessHours: BusinessHour[]
  coverImages: string[]
  notice: string
  bookingMode?: BookingMode
  location?: ShopLocation
  updatedAt?: Date | string
}

export interface ShrimpPackage {
  _id: string
  name: string
  description: string
  durationMinutes: number
  price: number
  rodCount: number
  maxPeople: number
  status: PackageStatus
  sort: number
}

export interface TimeSlot {
  _id: string
  date: string
  startTime: string
  endTime: string
  capacity: number
  bookedCount: number
  status: TimeSlotStatus
  remark: string
}

export interface HomeData {
  settings: ShopSettings
  packages: ShrimpPackage[]
  timeSlots: TimeSlot[]
  serverTime: string
}

export interface CloudFunctionResponse<T> {
  code: number
  message: string
  data: T
}
