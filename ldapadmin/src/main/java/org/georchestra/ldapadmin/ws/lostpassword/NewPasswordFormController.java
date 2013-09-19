/**
 * 
 */
package org.georchestra.ldapadmin.ws.lostpassword;

import java.io.IOException;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.georchestra.ldapadmin.ds.AccountDao;
import org.georchestra.ldapadmin.ds.DataServiceException;
import org.georchestra.ldapadmin.ds.NotFoundException;
import org.georchestra.ldapadmin.ds.UserTokenDao;
import org.georchestra.ldapadmin.ws.utils.PasswordUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.SessionAttributes;
import org.springframework.web.bind.support.SessionStatus;

/**
 * This controller implements the interactions required to ask for a new password based on a token provide.
 * 
 * @author Mauricio Pazos
 *
 */
@Controller
@SessionAttributes(types=NewPasswordFormBean.class)
public class NewPasswordFormController {

	private static final Log LOG = LogFactory.getLog(NewPasswordFormController.class.getName());

	private AccountDao accountDao;
	private UserTokenDao userTokenDao;
	
	@Autowired
	public NewPasswordFormController( AccountDao accountDao, UserTokenDao userTokenDao){
		this.accountDao = accountDao;
		this.userTokenDao = userTokenDao;
	}
	
	
	@InitBinder
	public void initForm( WebDataBinder dataBinder) {
		
		dataBinder.setAllowedFields(new String[]{"password", "confirmPassword"});
	}
	

	/**
	 * Search the user associated to the provided token, then initialize the {@link NewPasswordFormBean}. 
	 * If the token is not valid (it didn't exist in the system registry) the LostPasswordForm is presented to offer a new
	 * chance to the user. 
	 * 
	 * @param token	the token was generated by the {@link LostPasswordFormController}}
	 * @param model 
	 * 
	 * @return newPasswordForm or lostPasswordForm
	 * 
	 * @throws IOException
	 */
	@RequestMapping(value="/account/newPassword", method=RequestMethod.GET)
	public String setupForm(@RequestParam("token") String token, Model model) throws IOException{
		

		try{
			final String uid = this.userTokenDao.findUserByToken(token);
			
			NewPasswordFormBean formBean = new NewPasswordFormBean();

			formBean.setToken(token);
			formBean.setUid(uid);
			
			model.addAttribute(formBean);
			
			return "newPasswordForm";
			
		} catch(NotFoundException e){

			return "lostPasswordForm";
			
		} catch (DataServiceException e) {

			LOG.error("cannot insert the setup the lostPasswordForm. " + e.getMessage());
			
			throw new IOException(e);
		} 
		
	}

	/**
	 * Registers the new password, if it is valid.
	 * 
	 * @param formBean
	 * @param result
	 * @param sessionStatus
	 * 
	 * @return the next view
	 * 
	 * @throws IOException 
	 */
	@RequestMapping(value="/account/newPassword", method=RequestMethod.POST)
	public String newPassword(
						@ModelAttribute NewPasswordFormBean formBean, 
						BindingResult result, 
						SessionStatus sessionStatus) 
						throws IOException {
		
		
		PasswordUtils.validate( formBean.getPassword(), formBean.getConfirmPassword(), result);

		
		if(result.hasErrors()){
			
			return "newPasswordForm";
		}

		// changes the user's password and removes the token 
		try {

			String uid = formBean.getUid();
			String  password = formBean.getPassword();
			
			this.accountDao.changePassword(uid, password);

			this.userTokenDao.delete(uid);
			
			sessionStatus.setComplete();
			
			return "passwordUpdated";			
			
		} catch (DataServiceException e) {
			LOG.error("cannot set the the new password. " + e.getMessage());
			
			throw new IOException(e);
			
		} 
	}

}
