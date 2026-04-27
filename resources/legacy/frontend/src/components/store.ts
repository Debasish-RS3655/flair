import { create } from 'zustand';

interface User {
  username: string;
  profileImage: string;
}

interface OtherUser {
  username: string;
  bio: string;
  name: string;
  profileImage: string;
  email: string;
  displayText: string;
}

const useUserStore = create<{
  user: User | null;
  setUser: (user: User) => void;
  clearUser: () => void;
}>(set => ({
  user: null,
  setUser: (user: User) => set({ user }),
  clearUser: () => set({ user: null }),
}));

const useUser = () => {
  const { user, setUser, clearUser } = useUserStore();
  return { user, setUser, clearUser };
};

const useOtherUserStore = create<{
  otherUser: OtherUser | null;
  setOtherUser: (user: OtherUser) => void;
  clearOtherUser: () => void;
}>(set => ({
  otherUser: null,
  setOtherUser: (otherUser: OtherUser) => set({ otherUser }),
  clearOtherUser: () => set({ otherUser: null }),
}));

const useOtherUser = () => {
  const { otherUser, setOtherUser, clearOtherUser } = useOtherUserStore();
  return { otherUser, setOtherUser, clearOtherUser };
};

export { useUser, useOtherUser };
