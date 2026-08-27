export type PackageStatus = 'active' | 'disabled' | 'deleted'
export type TimeSlotStatus = 'available' | 'full' | 'closed'
export type BookingMode = 'walk_in' | 'slot'
export type PaymentMode = 'mock_auto_paid' | 'mock_pending_payment'

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
  paymentMode?: PaymentMode
  location?: ShopLocation
  updatedAt?: Date | string
}

export interface SaveShopSettingsParams {
  shopName: string
  address: string
  phone: string
  businessHours: BusinessHour[]
  notice: string
  bookingMode: BookingMode
  paymentMode: PaymentMode
}

export interface SaveShopSettingsResult {
  settings: ShopSettings
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

export interface PricingRule {
  _id: string
  name: string
  description: string
  pricePerHour: number
  firstHourAmount?: number
  extraPricePerHour?: number
  minimumMinutes: number
  unitMinutes: number
  status: 'active' | 'disabled'
  sort: number
}

export interface HomeData {
  settings: ShopSettings
  packages: ShrimpPackage[]
  timeSlots: TimeSlot[]
  pricingRule?: PricingRule
  serverTime: string
}

export interface CloudFunctionResponse<T> {
  code: number
  message: string
  data: T
}
