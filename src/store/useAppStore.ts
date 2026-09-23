import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

interface Profile {
  _id: string;
  email: string;
  phone: string;
  status: string;
  firstName: string;
  lastName: string;
}

interface AppState {
  profile: Profile | null;
  setProfile: (profile: Profile) => void;
  clearProfile: () => void;
}

const initialProfileState: Profile | null = null;

const initialState: AppState = {
  profile: initialProfileState,
  setProfile: () => {},
  clearProfile: () => {}
};

export const useAppStore = create<AppState>()(
  persist(
    immer(set => ({
      ...initialState,
      setProfile: (profile: Profile) => {
        set(state => {
          state.profile = profile;
        });
      },
      clearProfile: () =>
        set(state => {
          state.profile = initialProfileState;
        })
    })),
    {
      name: "app"
    }
  )
);
