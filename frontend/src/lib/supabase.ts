import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for our cached data
export interface CachedCorrelation {
  id?: string;
  market1_id: string;
  market1_question: string;
  market1_token_yes: string;
  market1_yes_price: number;
  market1_no_price: number;
  market2_id: string;
  market2_question: string;
  market2_token_yes: string;
  market2_yes_price: number;
  market2_no_price: number;
  correlation_type: 'SAME' | 'OPPOSITE' | 'NONE';
  reasoning: string;
  has_liquidity: boolean;
  profit_at_100_shares: number | null;
  last_checked: string;
  created_at?: string;
}

// Helper functions
export async function getCachedCorrelations(): Promise<CachedCorrelation[]> {
  const { data, error } = await supabase
    .from('correlated_pairs')
    .select('*')
    .eq('has_liquidity', true)
    .order('profit_at_100_shares', { ascending: false });
  
  if (error) {
    console.error('[Supabase] Error fetching cached correlations:', error);
    return [];
  }
  return data || [];
}

export async function upsertCorrelation(correlation: CachedCorrelation): Promise<void> {
  const { error } = await supabase
    .from('correlated_pairs')
    .upsert(correlation, { 
      onConflict: 'market1_id,market2_id',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error('[Supabase] Error upserting correlation:', error);
  }
}

export async function markNoLiquidity(market1Id: string, market2Id: string): Promise<void> {
  const { error } = await supabase
    .from('correlated_pairs')
    .update({ has_liquidity: false, last_checked: new Date().toISOString() })
    .or(`and(market1_id.eq.${market1Id},market2_id.eq.${market2Id}),and(market1_id.eq.${market2Id},market2_id.eq.${market1Id})`);
  
  if (error) {
    console.error('[Supabase] Error marking no liquidity:', error);
  }
}
