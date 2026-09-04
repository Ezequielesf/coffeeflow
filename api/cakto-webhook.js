import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://tuecuhzmsyauzkdclrdv.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use your service role key for backend updates

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    
    // Safely inspect payload structure using optional chaining
    const eventType = event?.event || event?.type;
    const customerEmail = event?.customer?.email || event?.data?.customer?.email || event?.email;

    // Acknowledge receipt immediately with a 200 OK to prevent Cakto retransmissions/500 errors
    res.status(200).json({ received: true });

    if ((eventType === 'approved' || eventType === 'order.paid' || eventType === 'Compra aprovada') && customerEmail) {
      const cleanEmail = customerEmail.trim().toLowerCase();
      
      // Calculate a new expiration date (e.g., +30 days from now)
      const novaDataExpiracao = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Update the cafeteria plan status in Supabase
      const { error } = await supabase
        .from('cafeterias')
        .update({ plano_ativo: true, data_expiracao: novaDataExpiracao })
        .eq('email', cleanEmail);

      if (error) {
        console.error('Supabase update error inside webhook:', error.message);
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    // Always return 200 or 204 to Cakto even if internal logic fails, 
    // otherwise Cakto's server will treat it as a 500 and continuously retry.
    return res.status(200).json({ error: 'Handled internal exception' });
  }
}
