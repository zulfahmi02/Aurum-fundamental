export function assertFreeAndroidBuild(usage, account) {
  if (usage?.account?.name !== account || usage.account.plan !== 'Free') {
    throw new Error('Build dihentikan: akun/paket gratis EAS belum terverifikasi. Tidak ada upgrade otomatis.');
  }
  for (const quota of [usage.builds?.plan, usage.builds?.android?.plan]) {
    if (!Number.isInteger(quota?.used) || !Number.isInteger(quota?.limit)
      || quota.used < 0 || quota.limit <= quota.used) {
      throw new Error('Build dihentikan: kuota gratis Android tidak tersedia atau tidak dapat diperiksa.');
    }
  }
}
