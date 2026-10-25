import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Alert, Button, Form, Input, Spin } from "antd";
import AuthLayout from "@/layouts/AuthLayout";
import { REFRESH_TOKEN_KEY } from "@/constants";
import { PATH_AUTH } from "@/constants/paths";
import { MIN_PASSWORD_LENGTH, PASSWORD_REQUIRED_MESSAGE } from "@/constants/validate";
import {
  acceptInvitationAPI,
  previewInvitationAPI,
  type InvitationPreview
} from "@/services/staff";
import { logoutAPI, refreshProfile } from "@/services/auth";
import { useAppStore } from "@/store/useAppStore";
import { clearSession, getSessionId } from "@/utils/session";
import { getCookies } from "@/utils/cookies";

interface Identity {
  sessionId: string | undefined;
  revision: number;
  check: number;
  email: string | null;
}

// Invitation setup follows the shared-account policy used by the acceptance API.
const NEW_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
const NEW_PASSWORD_MESSAGE = `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự, tối đa 128 ký tự, chứa chữ thường, chữ hoa, số và ký tự đặc biệt (@$!%*?&).`;

const LINK_STATES = {
  expired: ["Lời mời đã hết hạn", "Liên hệ người mời để được gửi liên kết mới."],
  unusable: [
    "Lời mời không còn sử dụng được",
    "Liên kết không hợp lệ hoặc đã bị thu hồi. Liên hệ người mời để được hỗ trợ."
  ],
  already_accepted: [
    "Lời mời đã được chấp nhận",
    "Bạn có thể đăng nhập CMS bằng tài khoản của mình."
  ],
  accepted: ["Đã chấp nhận lời mời", "Đăng nhập CMS bằng tài khoản của bạn để tiếp tục."]
};

export default function AcceptStaffInvitation() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("token"));
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [previewCheck, setPreviewCheck] = useState(0);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityError, setIdentityError] = useState(false);
  const [identityCheck, setIdentityCheck] = useState(0);
  const [result, setResult] = useState<"accepted" | "already_accepted" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const alive = useRef(false);
  const sessionRevision = useAppStore(state => state.sessionRevision);
  const [form] = Form.useForm<{ password: string; confirmation: string }>();

  useEffect(() => {
    alive.current = true;
    // Remove the secret before making any requests; retain it only for this mounted page.
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search
    );
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void previewInvitationAPI(token, controller.signal)
      .then(({ data }) => {
        if (!controller.signal.aborted) setPreview(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreviewError(true);
      });
    return () => controller.abort();
  }, [token, previewCheck]);

  useEffect(() => {
    const check = () => setIdentityCheck(value => value + 1);
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);

  useEffect(() => {
    if (!token) return;
    let current = true;
    const sessionId = getSessionId();
    void refreshProfile()
      .then(() => {
        if (!current) return;
        if (
          getSessionId() !== sessionId ||
          useAppStore.getState().sessionRevision !== sessionRevision
        ) {
          setIdentityCheck(value => value + 1);
          return;
        }
        const profile = useAppStore.getState().profile;
        if (sessionId && !profile?.email) throw new Error("Missing CMS identity");
        setIdentityError(false);
        setIdentity({
          sessionId,
          revision: sessionRevision,
          check: identityCheck,
          email: sessionId ? profile!.email : null
        });
      })
      .catch(() => {
        if (current) setIdentityError(true);
      });
    return () => {
      current = false;
    };
  }, [token, sessionRevision, identityCheck]);

  const identityReady =
    identity !== null &&
    !identityError &&
    identity.sessionId === getSessionId() &&
    identity.revision === sessionRevision &&
    identity.check === identityCheck;
  const mismatch =
    preview?.state === "pending" &&
    identity?.email != null &&
    identity.email.trim().toLowerCase() !== preview.email.trim().toLowerCase();
  const canAccept = identityReady && !mismatch;

  const accept = async ({ password }: { password: string }) => {
    if (busyRef.current || preview?.state !== "pending" || !token || result) return;
    if (
      !canAccept ||
      identity.sessionId !== getSessionId() ||
      identity.revision !== useAppStore.getState().sessionRevision
    ) {
      setIdentityCheck(value => value + 1);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data } = await acceptInvitationAPI(token, password);
      if (alive.current) {
        setResult(data.state);
        form.resetFields();
      }
    } catch {
      // Server/provider errors may contain secrets; display only fixed, invitation-specific copy.
      if (alive.current) {
        setError(
          "Không thể chấp nhận lời mời. Kiểm tra mật khẩu hoặc liên hệ người mời nếu liên kết đã hết hạn hay bị thu hồi."
        );
        form.resetFields();
        setPreview(null);
        setPreviewCheck(value => value + 1);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const signOut = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const sessionId = getSessionId();
    const revision = useAppStore.getState().sessionRevision;
    const refreshToken = getCookies(REFRESH_TOKEN_KEY);
    try {
      // As in the CMS header, local sign-out still completes if server revocation fails.
      if (refreshToken) await logoutAPI({ refreshToken }).catch(() => undefined);
      if (getSessionId() === sessionId && useAppStore.getState().sessionRevision === revision)
        clearSession();
    } finally {
      busyRef.current = false;
      if (alive.current) {
        setBusy(false);
        setIdentityCheck(value => value + 1);
      }
    }
  };

  const state = result ?? (preview?.state !== "pending" ? preview?.state : null);
  const linkState = state ? LINK_STATES[state] : null;

  return (
    <AuthLayout>
      <h1 className='m-0 mb-4 text-[22px] font-semibold'>Chấp nhận lời mời nhân viên</h1>
      {!token ? (
        <p>Mở lại liên kết trong email để chấp nhận lời mời.</p>
      ) : linkState ? (
        <Alert
          title={linkState[0]}
          description={linkState[1]}
          type={state === "accepted" || state === "already_accepted" ? "success" : "warning"}
          showIcon
        />
      ) : previewError ? (
        <>
          <Alert type='error' title='Không thể tải lời mời. Vui lòng thử lại.' showIcon />
          <Button
            className='mt-4'
            onClick={() => {
              setPreviewError(false);
              setPreviewCheck(value => value + 1);
            }}
          >
            Thử lại
          </Button>
        </>
      ) : preview?.state === "pending" ? (
        <>
          <p>
            Email: <strong>{preview.email}</strong>
          </p>
          <p>
            Vai trò: <strong>{preview.roleName}</strong>
          </p>
          <p>Hết hạn: {new Date(preview.expiresAt).toLocaleString("vi-VN")}</p>
          {identityError ? (
            <>
              <Alert
                type='error'
                title='Không thể xác minh tài khoản CMS. Vui lòng thử lại hoặc đăng xuất.'
                showIcon
              />
              <Button className='my-3' onClick={() => setIdentityCheck(value => value + 1)}>
                Thử lại
              </Button>
            </>
          ) : !identityReady ? (
            <p role='status'>Đang xác minh tài khoản CMS...</p>
          ) : mismatch ? (
            <Alert
              type='warning'
              title='Bạn đang đăng nhập bằng tài khoản khác'
              description={`Tài khoản CMS hiện tại: ${identity.email}. Đăng xuất CMS để tiếp tục với email được mời.`}
              showIcon
            />
          ) : null}
          {(mismatch || identityError) && (
            <Button className='my-3' onClick={() => void signOut()} disabled={busy}>
              Đăng xuất CMS để tiếp tục
            </Button>
          )}
          <p>
            {preview.passwordMode === "existing"
              ? "Nhập mật khẩu hiện tại của tài khoản này. Mật khẩu và thông tin khách hàng được giữ nguyên."
              : "Đặt mật khẩu để đăng nhập CMS. Tài khoản và đăng nhập Google hiện có được giữ nguyên."}
          </p>
          {error && <Alert className='mb-4' type='error' title={error} showIcon />}
          <Form
            form={form}
            name='staff-invitation'
            layout='vertical'
            requiredMark={false}
            disabled={!canAccept || busy}
            onFinish={values => void accept(values)}
          >
            <Form.Item
              name='password'
              label={preview.passwordMode === "existing" ? "Mật khẩu hiện tại" : "Mật khẩu mới"}
              rules={[
                { required: true, message: PASSWORD_REQUIRED_MESSAGE },
                ...(preview.passwordMode === "set"
                  ? [
                      {
                        transform: (value: string) => value.trim(),
                        min: MIN_PASSWORD_LENGTH,
                        max: 128,
                        pattern: NEW_PASSWORD_PATTERN,
                        message: NEW_PASSWORD_MESSAGE
                      }
                    ]
                  : [])
              ]}
            >
              <Input.Password
                autoComplete={
                  preview.passwordMode === "existing" ? "current-password" : "new-password"
                }
              />
            </Form.Item>
            {preview.passwordMode === "set" && (
              <Form.Item
                name='confirmation'
                label='Xác nhận mật khẩu'
                dependencies={["password"]}
                rules={[
                  { required: true, message: "Vui lòng xác nhận mật khẩu" },
                  ({ getFieldValue }) => ({
                    validator: (_, value: string) =>
                      !value || value === getFieldValue("password")
                        ? Promise.resolve()
                        : Promise.reject(new Error("Mật khẩu xác nhận không khớp"))
                  })
                ]}
              >
                <Input.Password autoComplete='new-password' />
              </Form.Item>
            )}
            <Button
              type='primary'
              htmlType='submit'
              block
              disabled={!canAccept || busy}
              loading={busy}
            >
              Chấp nhận lời mời
            </Button>
          </Form>
        </>
      ) : (
        <Spin description='Đang tải lời mời...'>
          <div className='h-24' />
        </Spin>
      )}
      <p className='mt-5 mb-0'>
        <Link to={PATH_AUTH.LOGIN}>Đăng nhập CMS</Link>
      </p>
    </AuthLayout>
  );
}
