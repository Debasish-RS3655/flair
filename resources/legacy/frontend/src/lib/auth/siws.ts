// Debashish Buragohain

import type { SignInMessageSignerWalletAdapter } from '@solana/wallet-adapter-base'
import { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features'
import { web3 } from '@project-serum/anchor'

const apiUrl = process.env.NEXT_PUBLIC_API_URL

// the singleton memory storage class for siws contains the input and output fields only
export class MemoryStoredTokenSiws {
  private constructor(
    public input: SolanaSignInInput | undefined = undefined,
    public output: SolanaSignInOutput | undefined = undefined,
  ) {}
  private static instance: MemoryStoredTokenSiws
  static getInstance(): MemoryStoredTokenSiws {
    if (!MemoryStoredTokenSiws.instance) {
      MemoryStoredTokenSiws.instance = new MemoryStoredTokenSiws()
    }
    return MemoryStoredTokenSiws.instance
  }
  public setAuth(input: SolanaSignInInput, output: SolanaSignInOutput) {
    this.input = input
    this.output = output
  }
}

// fetch the signInInput from the backend
export const getSignInData = async (publicKey: web3.PublicKey): Promise<SolanaSignInInput> => {
  const createResponse = (
    await fetch(apiUrl + '/auth/signin/' + publicKey.toBase58())
  ).json() as SolanaSignInInput
  return createResponse
  // its mandatory now to send the wallet address also to the backend
  // return publicKey ? {...createResponse, address: publicKey.toBase58()} : createResponse;
}

// creates the sign in input and output tokens and stores in memory
export const siwsSignIn = async (
  publicKey: web3.PublicKey,
  signIn: (input?: SolanaSignInInput) => Promise<SolanaSignInOutput> | undefined,
  signInAdapter?: SignInMessageSignerWalletAdapter,
): Promise<boolean> => {
  const input = await getSignInData(publicKey)
  // store this input in memory now
  // send this received sign in input to the wallet and trigger a sign-in request
  // this pops up the message for the user to sign in
  let output: SolanaSignInOutput | undefined = undefined
  if (!signInAdapter) {
    // const { signIn } = useWallet();
    if (signIn) output = await signIn(input)
    else throw new Error('Wallet does not support Sign In With Solana (SIWS)')
  } else {
    // if the signIn function is not null then use that
    output = await signInAdapter.signIn(input)
  }
  if (!output) throw new Error('Solana Sign In Output is invalid')
  // the output is of type SolanaSignInOutput
  const strPayload = JSON.stringify({ input, output })
  const verifyResponse = await fetch(apiUrl + '/auth/signin', {
    method: 'POST',
    body: strPayload,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  }).then(r => r.json())

  if (!verifyResponse.success) {
    console.error('Sign In Verfication failed!')
    throw new Error('Sign In Verfication failed!')
  }
  // nothing till here means we have successfully signed in
  // dont need to do auto connect now
  // store the headers in memory now
  console.log('SIWS workflow Sign In Successful.')
  const cliUrl = process.env.NEXT_PUBLIC_CLI_URL || 'http://localhost:4002/authToken';
  try {
    // send the auth token to the cli server now
    await fetch(cliUrl, {
      method: 'POST',
      body: JSON.stringify({
        authToken: `siws${btoa(JSON.stringify({ input, output, action: 'signin' }))}`,
        wallet: publicKey.toBase58(),
      }),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
    console.log('sent general auth token to the cli server.')
  } catch (err) {
    console.error(`Error sending general auth token to cli server: ${err}`)
  }

  // Umi support removed
  // creating the Umi object here after a successful sign in
  // const { adapter } = useAdapter();
  // const { setUmi } = useUmi();
  // const umi = await initializeUmi(adapter);
  // setUmi(umi);

  MemoryStoredTokenSiws.getInstance().setAuth(input, output)
  return false
}
