"use client";
import { Icon } from "@/components/icon";
import { signOutEverywhere } from "@/components/shell/account-menu";

export function SignOutButton() {
  return (
    <button className="btn btn--sm" type="button" onClick={signOutEverywhere}>
      <Icon name="logout" />Sign out
    </button>
  );
}
