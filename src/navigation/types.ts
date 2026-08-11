export type RootStackParamList = {
  Houses: undefined;
  Visit: { houseId: string };
  Receipt: { donationUuid: string };
  Summary: undefined;
  Payment: { amountCents: number } | undefined;
};
