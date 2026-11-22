import { PriceQuote, PricingRuleConfig, ServerSpecs } from './types.js';
import { DEFAULT_PRICING_RULE, VALID_COUPONS } from './constants.js';

export function calculatePriceQuote(
  specs: ServerSpecs, 
  pricingRule: PricingRuleConfig = DEFAULT_PRICING_RULE,
  availableCoupons?: any[]
): PriceQuote {
  const ramGb = Math.max(0.25, specs.ramMb / 1024);
  const cpuCores = Math.max(0.25, specs.cpuPercent / 100);
  const diskGb = Math.max(1, specs.diskGb);
  const backupSlots = Math.max(0, specs.backupSlots || 0);
  const extraPorts = Math.max(0, specs.extraPorts || 0);
  const databases = Math.max(0, specs.databases || 0);
  const durationMonths = [1, 3, 6, 12].includes(specs.durationMonths) ? specs.durationMonths : 1;

  // Breakdown prices (per month in Rupiah)
  const ramPrice = Math.round(ramGb * pricingRule.pricePerGbRam);
  const cpuPrice = Math.round(cpuCores * pricingRule.pricePerCpuCore);
  const diskPrice = Math.round(diskGb * pricingRule.pricePerGbDisk);
  const backupPrice = Math.round(backupSlots * pricingRule.pricePerBackupSlot);
  const portsPrice = Math.round(extraPorts * pricingRule.pricePerExtraPort);
  const databasesPrice = Math.round(databases * pricingRule.pricePerDatabase);
  const baseMonthly = pricingRule.baseMonthlyFee;

  const monthlySubtotal = baseMonthly + ramPrice + cpuPrice + diskPrice + backupPrice + portsPrice + databasesPrice;
  const grossTotal = monthlySubtotal * durationMonths;

  // Duration discount percentage
  const durationDiscounts = pricingRule.durationDiscounts || {
    1: 0,
    3: (pricingRule as any).discountMonths3 ?? 0.05,
    6: (pricingRule as any).discountMonths6 ?? 0.10,
    12: (pricingRule as any).discountMonths12 ?? 0.20
  };
  const discountRate = durationDiscounts[durationMonths as 1 | 3 | 6 | 12] || 0;
  const discountPercent = Math.round(discountRate * 100);
  const discountAmount = Math.round(grossTotal * discountRate);

  let netBeforeCoupon = grossTotal - discountAmount;
  let couponDiscountAmount = 0;

  if (specs.couponCode) {
    const couponKey = specs.couponCode.trim().toUpperCase();
    let coupon = VALID_COUPONS[couponKey];
    if (!coupon && availableCoupons) {
      const match = availableCoupons.find(c => c.code.toUpperCase() === couponKey && c.isActive);
      if (match) {
        coupon = {
          discountPercent: match.discountPercent,
          discountFixed: match.discountFixed,
          maxDiscount: match.maxDiscount
        };
      }
    }

    if (coupon) {
      if (coupon.discountPercent) {
        let promo = Math.round(netBeforeCoupon * (coupon.discountPercent / 100));
        if (coupon.maxDiscount && promo > coupon.maxDiscount) {
          promo = coupon.maxDiscount;
        }
        couponDiscountAmount = promo;
      } else if (coupon.discountFixed) {
        couponDiscountAmount = Math.min(coupon.discountFixed, netBeforeCoupon - 1000);
      }
    }
  }

  const netTotal = Math.max(1000, netBeforeCoupon - couponDiscountAmount);
  // Admin fee (default Rp 750 for QRIS fee when charged to buyer)
  const adminFee = 750;
  const totalPayable = netTotal + adminFee;

  // Validation against BuatQris limits
  let isValid = true;
  let validationError: string | undefined = undefined;

  if (totalPayable < pricingRule.minAmount) {
    isValid = false;
    validationError = `Total pembayaran minimal Rp ${pricingRule.minAmount.toLocaleString('id-ID')}`;
  } else if (totalPayable > pricingRule.maxAmount) {
    isValid = false;
    validationError = `Total pembayaran melebihi batas BuatQris (Maksimal Rp ${pricingRule.maxAmount.toLocaleString('id-ID')}). Silakan pilih durasi lebih pendek atau kurangi resource.`;
  }

  return {
    ramPrice,
    cpuPrice,
    diskPrice,
    backupPrice,
    portsPrice,
    databasesPrice,
    baseMonthly,
    monthlySubtotal,
    durationMonths,
    grossTotal,
    discountPercent,
    discountAmount,
    couponDiscountAmount,
    netTotal,
    adminFee,
    totalPayable,
    isValid,
    validationError
  };
}
