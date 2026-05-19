export interface UserProfile {
  walletAddress: string;
  name: string;
  email: string;
  registeredAt: string;
  accountType: 'holder' | 'organization';
  organizationName?: string;
}

export interface AuthContextType {
  user: UserProfile | null;
  login: (address: string) => UserProfile | null;
  register: (profile: UserProfile) => void;
  logout: () => void;
  isRegistered: (address: string) => boolean;
  walletDisconnected: boolean;
  setWalletDisconnected: (val: boolean) => void;
}