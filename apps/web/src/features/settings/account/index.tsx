import { ContentSection } from '../components/content-section'
import { ChangePasswordForm } from './change-password-form'

export function SettingsAccount() {
  return (
    <ContentSection
      title='账户安全'
      desc='修改你的登录密码以保护账户安全'
    >
      <ChangePasswordForm />
    </ContentSection>
  )
}
