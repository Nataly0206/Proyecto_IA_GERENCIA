import { Stack } from '@mui/material';
import ProductionStaffPanel from '../components/live/ProductionStaffPanel';

export default function ProductionStaffPage({ userId }: { userId: string }) {
  return <Stack spacing={1.5} sx={{ py: { xs: 0, sm: 2 }, height: '100%', minHeight: 0, overflow: 'auto' }}>
    <ProductionStaffPanel userId={userId} />
  </Stack>;
}
