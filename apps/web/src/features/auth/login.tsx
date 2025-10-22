/**
 * 登录页面
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { useLogin, useInitAdmin } from '@/hooks/use-auth-api';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const loginMutation = useLogin();
    const initAdminMutation = useInitAdmin();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !password) return;

        loginMutation.mutate({ username, password });
    };

    const handleInitAdmin = () => {
        initAdminMutation.mutate();
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1 text-center">
                    <div className="flex justify-center mb-4">
                        <ShieldCheck className="h-12 w-12 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold">API Gateway 管理后台</CardTitle>
                    <CardDescription>
                        请登录以继续访问
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">用户名</Label>
                            <Input
                                id="username"
                                type="text"
                                placeholder="请输入用户名"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={loginMutation.isPending}
                                autoComplete="username"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">密码</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="请输入密码"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loginMutation.isPending}
                                autoComplete="current-password"
                                required
                            />
                        </div>

                        {loginMutation.isError && (
                            <Alert variant="destructive">
                                <AlertDescription>
                                    {loginMutation.error?.message || '登录失败，请检查用户名和密码'}
                                </AlertDescription>
                            </Alert>
                        )}

                        {initAdminMutation.isSuccess && (
                            <Alert>
                                <AlertDescription>
                                    默认管理员账号已创建：admin / admin123
                                    <br />
                                    ⚠️ 登录后请立即修改密码！
                                </AlertDescription>
                            </Alert>
                        )}

                        {initAdminMutation.isError && (
                            <Alert variant="destructive">
                                <AlertDescription>
                                    {initAdminMutation.error?.message}
                                </AlertDescription>
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={loginMutation.isPending || !username || !password}
                        >
                            {loginMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    登录中...
                                </>
                            ) : (
                                <>
                                    <LogIn className="mr-2 h-4 w-4" />
                                    登录
                                </>
                            )}
                        </Button>

                        <div className="text-center">
                            <Button
                                type="button"
                                variant="link"
                                className="text-sm text-muted-foreground"
                                onClick={handleInitAdmin}
                                disabled={initAdminMutation.isPending}
                            >
                                {initAdminMutation.isPending ? '初始化中...' : '首次使用？初始化管理员账号'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

