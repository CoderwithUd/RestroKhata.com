"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, type InputHTMLAttributes } from "react";
import { writeStoredSession } from "@/lib/auth-session";
import { getErrorMessage } from "@/lib/error";
import { slugify } from "@/lib/slugify";
import { useLoginMutation, useRegisterMutation, useLazyMeQuery } from "@/store/api/authApi";
import { useAppDispatch } from "@/store/hooks";
import { setSession } from "@/store/slices/authSlice";

type FormMode = "login" | "register";

type AuthCardProps = {
  mode: FormMode;
};

type LoginForm = {
  identifier: string;
  password: string;
};

type TenantLoginOption = {
  tenantName: string;
  tenantSlug: string;
  role?: string;
};

type RegisterForm = {
  ownerName: string;
  tenantName: string;
  whatsappNumber: string;
  email: string;
  password: string;
  confirmPassword: string;
  gstNumber: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

const initialLoginForm: LoginForm = {
  identifier: "",
  password: "",
};

const initialRegisterForm: RegisterForm = {
  ownerName: "",
  tenantName: "",
  whatsappNumber: "",
  email: "",
  password: "",
  confirmPassword: "",
  gstNumber: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: "India",
  postalCode: "",
};

function sanitizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

export function AuthCard({ mode }: AuthCardProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [loginMutation] = useLoginMutation();
  const [registerMutation] = useRegisterMutation();
  const [loadMe] = useLazyMeQuery();

  const isLogin = mode === "login";
  const [loginForm, setLoginForm] = useState<LoginForm>(initialLoginForm);
  const [registerForm, setRegisterForm] = useState<RegisterForm>(initialRegisterForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [tenantOptions, setTenantOptions] = useState<TenantLoginOption[]>([]);

  const submitLabel = isLogin ? "Sign in" : "Create account";
  const switchLink = isLogin
    ? { href: "/register", text: "Create an account" }
    : { href: "/login", text: "Sign in to your account" };

  const validateError = useMemo(
    () =>
      (payload: LoginForm | RegisterForm): string => {
        if (!payload.password.trim()) {
          return "Password is required.";
        }

        if (payload.password.trim().length < 6) {
          return "Password must be at least 6 characters.";
        }

        if (isLogin) {
          const loginPayload = payload as LoginForm;
          const identifier = loginPayload.identifier.trim();
          if (!identifier) return "WhatsApp number or email is required.";
          if (identifier.includes("@")) {
            if (!/^\S+@\S+\.\S+$/.test(identifier)) return "Enter a valid email address.";
          } else if (identifier.replace(/\D/g, "").length < 10) {
            return "Enter a valid WhatsApp number.";
          }
        } else {
          const registerPayload = payload as RegisterForm;
          const whatsappNumber = registerPayload.whatsappNumber.trim();

          if (!whatsappNumber) return "WhatsApp number is required.";
          if (whatsappNumber.replace(/\D/g, "").length < 10) return "Enter a valid WhatsApp number.";
          if (!registerPayload.ownerName.trim()) return "Owner name is required.";
          if (!registerPayload.tenantName.trim()) return "Tenant name is required.";
          if (!registerPayload.email.trim()) return "Email is required.";
          if (!/^\S+@\S+\.\S+$/.test(registerPayload.email.trim())) return "Enter a valid email address.";
          if (!registerPayload.addressLine1.trim()) return "Address line 1 is required.";
          if (!registerPayload.city.trim()) return "City is required.";
          if (!registerPayload.state.trim()) return "State is required.";
          if (!registerPayload.country.trim()) return "Country is required.";
          if (!registerPayload.postalCode.trim()) return "Postal code is required.";
          if (registerPayload.password !== registerPayload.confirmPassword) {
            return "Password and confirm password must match.";
          }
        }

        return "";
      },
    [isLogin],
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const payload = isLogin ? loginForm : registerForm;
    const validationError = validateError(payload);

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const initialSession = isLogin
        ? await submitLogin()
        : await registerMutation({
            ownerName: registerForm.ownerName.trim(),
            whatsappNumber: registerForm.whatsappNumber.trim(),
            email: registerForm.email.trim(),
            password: registerForm.password.trim(),
            tenantName: registerForm.tenantName.trim(),
            tenantSlug: slugify(registerForm.tenantName),
            gstNumber: registerForm.gstNumber.trim() || undefined,
            address: {
              line1: registerForm.addressLine1.trim(),
              line2: registerForm.addressLine2.trim() || undefined,
              city: registerForm.city.trim(),
              state: registerForm.state.trim(),
              country: registerForm.country.trim(),
              postalCode: registerForm.postalCode.trim(),
            },
          }).unwrap();

      dispatch(setSession(initialSession));
      writeStoredSession(initialSession);

      let session = null;

      try {
        session = await loadMe(undefined, true).unwrap();
      } catch {
        if (!isLogin) {
          const loginSession = await loginMutation({
            whatsappNumber: registerForm.whatsappNumber.trim(),
            password: registerForm.password.trim(),
            tenantSlug: slugify(registerForm.tenantName),
          }).unwrap();
          dispatch(setSession(loginSession));
          writeStoredSession(loginSession);
          session = await loadMe(undefined, true).unwrap();
        }
      }

      if (!session) {
        throw new Error("Unable to load your profile after login.");
      }

      dispatch(setSession(session));
      writeStoredSession(session);
      router.replace("/dashboard");
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  async function submitLogin(tenantSlug?: string) {
    const identifier = loginForm.identifier.trim();

    try {
      const session = await loginMutation(
        identifier.includes("@")
          ? {
              email: identifier,
              password: loginForm.password.trim(),
              tenantSlug,
            }
          : {
              whatsappNumber: identifier,
              password: loginForm.password.trim(),
              tenantSlug,
            },
      ).unwrap();

      setTenantOptions([]);
      return session;
    } catch (submitError) {
      const options = extractTenantOptions(submitError);
      if (options.length) {
        setTenantOptions(options);
        throw new Error("Select a tenant to continue.");
      }
      throw submitError;
    }
  }

  const features = ["QR menu ordering", "Live kitchen flow", "Invoice management", "Sales reports"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-yellow-50/40">
      <div className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-[1150px]">
          <div className="mb-10 flex justify-center">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl shadow-sm">
                <Image
                  src="/RestroKhata-RK-Complete-Icons/icon-192x192.png"
                  alt="RestroKhata Logo"
                  width={32}
                  height={32}
                  className="h-8 w-8 object-contain"
                />
              </div>
              <span className="text-xl font-semibold tracking-tight text-gray-800">RestroKhata</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
            <div className="grid md:grid-cols-2">
              <div className="bg-gradient-to-br from-amber-50 to-yellow-50/50 p-8 md:p-10">
                <div className="flex h-full flex-col">
                  <div className="mb-8">
                    <h2 className="mb-3 text-3xl font-bold text-gray-800 md:text-4xl">
                      {isLogin ? "Welcome back" : "Launch your restaurant"}
                    </h2>
                    <p className="text-base leading-relaxed text-gray-500">
                      {isLogin
                        ? "Sign in with your WhatsApp number. Legacy email login still works for old accounts."
                        : "Create your owner account with tenant and address details."}
                    </p>
                  </div>

                  <div className="mb-8 space-y-4">
                    {features.map((feature) => (
                      <div key={feature} className="flex items-center gap-3">
                        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-200">
                          <svg className="h-3 w-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <span className="text-sm text-gray-700 md:text-base">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {!isLogin ? (
                    <div className="mt-auto border-t border-amber-200/50 pt-6">
                      <p className="text-xs text-gray-400">14-day trial. GST is optional. Staff can be added later.</p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="p-8 md:p-10">
                <form onSubmit={onSubmit} className="space-y-4">
                  {!isLogin ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                          label="Owner name"
                          value={registerForm.ownerName}
                          onChange={(value) => setRegisterForm((prev) => ({ ...prev, ownerName: value }))}
                          placeholder="Owner name"
                        />
                        <Input
                          label="Tenant name"
                          value={registerForm.tenantName}
                          onChange={(value) => setRegisterForm((prev) => ({ ...prev, tenantName: value }))}
                          placeholder="My Cafe"
                        />
                      </div>
                    </>
                  ) : null}

                  <div className={`grid gap-4 ${isLogin ? "sm:grid-cols-1" : "sm:grid-cols-2"}`}>
                    <Input
                      label={isLogin ? "WhatsApp or email" : "WhatsApp number"}
                      value={isLogin ? loginForm.identifier : registerForm.whatsappNumber}
                      onChange={(value) =>
                        isLogin
                          ? setLoginForm((prev) => ({
                              ...prev,
                              identifier: value.includes("@") ? value.trim() : sanitizePhone(value),
                            }))
                          : setRegisterForm((prev) => ({ ...prev, whatsappNumber: sanitizePhone(value) }))
                      }
                      placeholder={isLogin ? "9876543210 or owner@restaurant.com" : "9876543210"}
                      inputMode={isLogin ? "email" : "tel"}
                    />
                    {!isLogin ? (
                      <Input
                        label="Email"
                        type="email"
                        value={registerForm.email}
                        onChange={(value) => setRegisterForm((prev) => ({ ...prev, email: value }))}
                        placeholder="owner@restaurant.com"
                      />
                    ) : null}
                  </div>

                  <div className={`grid gap-4 ${isLogin ? "sm:grid-cols-1" : "sm:grid-cols-2"}`}>
                    <Input
                      label="Password"
                      type="password"
                      value={isLogin ? loginForm.password : registerForm.password}
                      onChange={(value) =>
                        isLogin
                          ? setLoginForm((prev) => ({ ...prev, password: value }))
                          : setRegisterForm((prev) => ({ ...prev, password: value }))
                      }
                      placeholder="Minimum 6 characters"
                    />
                    {!isLogin ? (
                      <Input
                        label="Confirm password"
                        type="password"
                        value={registerForm.confirmPassword}
                        onChange={(value) => setRegisterForm((prev) => ({ ...prev, confirmPassword: value }))}
                        placeholder="Re-enter password"
                      />
                    ) : null}
                  </div>

                  {!isLogin ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                          label="GST number"
                          value={registerForm.gstNumber}
                          onChange={(value) => setRegisterForm((prev) => ({ ...prev, gstNumber: value.toUpperCase() }))}
                          placeholder="Optional"
                        />
                        <Input
                          label="Postal code"
                          value={registerForm.postalCode}
                          onChange={(value) => setRegisterForm((prev) => ({ ...prev, postalCode: value }))}
                          placeholder="492001"
                          inputMode="numeric"
                        />
                      </div>

                      <Input
                        label="Address line 1"
                        value={registerForm.addressLine1}
                        onChange={(value) => setRegisterForm((prev) => ({ ...prev, addressLine1: value }))}
                        placeholder="Street, area, landmark"
                      />

                      <Input
                        label="Address line 2"
                        value={registerForm.addressLine2}
                        onChange={(value) => setRegisterForm((prev) => ({ ...prev, addressLine2: value }))}
                        placeholder="Optional"
                      />

                      <div className="grid gap-4 sm:grid-cols-3">
                        <Input
                          label="City"
                          value={registerForm.city}
                          onChange={(value) => setRegisterForm((prev) => ({ ...prev, city: value }))}
                          placeholder="Raipur"
                        />
                        <Input
                          label="State"
                          value={registerForm.state}
                          onChange={(value) => setRegisterForm((prev) => ({ ...prev, state: value }))}
                          placeholder="Chhattisgarh"
                        />
                        <Input
                          label="Country"
                          value={registerForm.country}
                          onChange={(value) => setRegisterForm((prev) => ({ ...prev, country: value }))}
                          placeholder="India"
                        />
                      </div>
                    </>
                  ) : null}

                  {error ? (
                    <div className="rounded-xl border border-red-100 bg-red-50 p-3">
                      <p className="text-sm text-red-500">{error}</p>
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    className="mt-2 w-full rounded-xl bg-amber-500 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Please wait..." : submitLabel}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <Link href={switchLink.href} className="text-sm text-gray-500 transition-colors hover:text-amber-600">
                    {switchLink.text}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLogin && tenantOptions.length ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => setTenantOptions([])}
            aria-label="Close tenant selection"
          />
          <section className="relative z-10 w-full max-w-md rounded-3xl border border-gray-100 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Select tenant</h3>
            <p className="mt-1 text-sm text-slate-500">Is account ke multiple tenant access hain. Continue karne ke liye ek choose karo.</p>
            <div className="mt-4 space-y-2">
              {tenantOptions.map((option) => (
                <button
                  key={`${option.tenantSlug}-${option.role || ""}`}
                  type="button"
                  onClick={async () => {
                    setError("");
                    setIsSubmitting(true);
                    try {
                      const initialSession = await submitLogin(option.tenantSlug);
                      dispatch(setSession(initialSession));
                      writeStoredSession(initialSession);
                      const session = await loadMe(undefined, true).unwrap();
                      dispatch(setSession(session));
                      writeStoredSession(session);
                      router.replace("/dashboard");
                    } catch (submitError) {
                      setError(getErrorMessage(submitError));
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  className="w-full rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-200 hover:bg-amber-100"
                  disabled={isSubmitting}
                >
                  <p className="text-sm font-semibold text-slate-900">{option.tenantName || option.tenantSlug}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {option.tenantSlug}
                    {option.role ? ` | ${option.role}` : ""}
                  </p>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function extractTenantOptions(error: unknown): TenantLoginOption[] {
  if (!error || typeof error !== "object") return [];

  const fetchError = error as {
    data?: {
      options?: unknown;
      tenants?: unknown;
      data?: { options?: unknown; tenants?: unknown };
    };
  };

  const rawOptions =
    fetchError.data?.options ||
    fetchError.data?.tenants ||
    fetchError.data?.data?.options ||
    fetchError.data?.data?.tenants;

  if (!Array.isArray(rawOptions)) return [];

  const parsed: TenantLoginOption[] = [];

  rawOptions.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;

    const option = entry as Record<string, unknown>;
    const tenantSlug = typeof option.tenantSlug === "string" ? option.tenantSlug.trim() : "";
    const tenantName = typeof option.tenantName === "string" ? option.tenantName.trim() : "";
    const role = typeof option.role === "string" ? option.role.trim() : undefined;
    if (!tenantSlug) return;

    parsed.push({
      tenantSlug,
      tenantName: tenantName || tenantSlug,
      role,
    });
  });

  return parsed;
}

type InputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
};

function Input({ label, value, onChange, placeholder, type = "text", inputMode }: InputProps) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base transition-all placeholder:text-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
        placeholder={placeholder}
      />
    </div>
  );
}
