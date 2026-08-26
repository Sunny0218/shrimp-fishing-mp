import type { PackageStatus, ShrimpPackage } from './home'

export interface ManagePackagesData {
  rows: ShrimpPackage[]
  total: number
  canEdit: boolean
  serverTime: string
}

export interface SavePackageParams {
  packageId?: string
  name: string
  description: string
  durationMinutes: number
  price: number
  rodCount: number
  maxPeople: number
  status: PackageStatus
  sort: number
}

export interface SavePackageResult {
  package: ShrimpPackage
}

export interface UpdatePackageStatusParams {
  packageId: string
  status: PackageStatus
}

export interface UpdatePackageStatusResult {
  package: ShrimpPackage
}

export interface DeletePackageParams {
  packageId: string
}

export interface DeletePackageResult {
  packageId: string
}
